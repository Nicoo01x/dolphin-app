import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUp, Loader2 } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import type { CharlaConDelfin, Delfin } from '../../../../../shared/delfines-types'
import { VentanaDeDelfin } from './VentanaDeDelfin'

type Linea = CharlaConDelfin & { clave: string }

function conClave(lineas: readonly CharlaConDelfin[]): Linea[] {
  return lineas.map((linea, indice) => ({ ...linea, clave: `${linea.cuando}-${indice}` }))
}

/** Una línea de la charla: lo tuyo a la derecha, lo del bot a la izquierda, lo de rutina chico. */
function Burbuja({ linea }: { linea: Linea }): React.JSX.Element {
  if (linea.quien === 'rutina' || linea.quien === 'sistema') {
    return (
      <p className="self-center px-4 text-center text-[11px] leading-snug text-muted-foreground">
        {linea.texto}
      </p>
    )
  }
  const mia = linea.quien === 'vos'
  return (
    <p
      className={cn(
        'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap',
        mia ? 'self-end bg-foreground text-background' : 'self-start bg-muted text-foreground'
      )}
    >
      {linea.texto}
    </p>
  )
}

/**
 * Hablarle a un delfín: la charla de su historial y un campo para escribirle. Cada mensaje es una
 * corrida entera de su motor, así que la respuesta tarda; mientras, se ve que está pensando.
 */
export function HablarConDelfin({
  delfin,
  nace,
  onCerrar
}: {
  delfin: Delfin
  nace: DOMRect | null
  onCerrar: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const hostId = delfin.donde.tipo === 'servidor' ? delfin.donde.hostId : undefined
  const [lineas, setLineas] = useState<Linea[] | null>(null)
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fondo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    void window.api?.delfines
      ?.charla({ id: delfin.id, ...(hostId ? { hostId } : {}) })
      .then((leida) => {
        if (vivo) {
          setLineas(leida.ok ? conClave(leida.charla) : [])
        }
      })
      .catch(() => vivo && setLineas([]))
    return () => {
      vivo = false
    }
  }, [delfin.id, hostId])

  useLayoutEffect(() => {
    fondo.current?.scrollIntoView({ block: 'end' })
  }, [lineas, pensando])

  const enviar = async (): Promise<void> => {
    const mensaje = texto.trim()
    const api = window.api?.delfines
    if (!mensaje || !api || pensando) {
      return
    }
    setTexto('')
    setError(null)
    setPensando(true)
    const ahora = new Date().toISOString()
    setLineas((antes) => [
      ...(antes ?? []),
      { cuando: ahora, quien: 'vos', texto: mensaje, clave: `${ahora}-vos` }
    ])
    const respuesta = await api
      .hablar({ id: delfin.id, texto: mensaje, ...(hostId ? { hostId } : {}) })
      .catch((causa: unknown) => ({
        ok: false as const,
        code: 'nucleo' as const,
        detail: causa instanceof Error ? causa.message : String(causa)
      }))
    setPensando(false)
    if (!respuesta.ok) {
      setError(
        respuesta.code === 'sin-conexion'
          ? t(
              'delfines.hablar.sinConexion',
              'The server is not connected. Connect it and try again.'
            )
          : (respuesta.detail ?? t('delfines.hablar.error', 'It did not answer. Try again.'))
      )
      return
    }
    const dicho =
      respuesta.respuesta.texto ||
      (respuesta.respuesta.nada
        ? t('delfines.hablar.nada', 'Nothing to report.')
        : t('delfines.hablar.sinRespuesta', 'No answer.'))
    const cuando = new Date().toISOString()
    setLineas((antes) => [
      ...(antes ?? []),
      { cuando, quien: 'bot', texto: dicho, clave: `${cuando}-bot` },
      ...(respuesta.respuesta.pidePermiso
        ? [
            {
              cuando,
              quien: 'sistema' as const,
              texto: t(
                'delfines.hablar.pide',
                'It asks for permission: {{que}}. Reply «dale» to let it.',
                {
                  que: respuesta.respuesta.pidePermiso
                }
              ),
              clave: `${cuando}-permiso`
            }
          ]
        : [])
    ])
  }

  return (
    <VentanaDeDelfin titulo={delfin.nombre} nace={nace} onCerrar={onCerrar} ancho="w-[34rem]">
      {() => (
        <div className="flex h-[min(32rem,calc(100vh-10rem))] flex-col gap-3">
          <div className="scrollbar-sleek -mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1">
            {lineas === null ? (
              <Loader2
                className="m-auto size-5 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            ) : lineas.length === 0 && !pensando ? (
              <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">
                {t(
                  'delfines.hablar.vacio',
                  'Ask it anything. It answers with its soul and its memory.'
                )}
              </p>
            ) : (
              lineas.map((linea) => <Burbuja key={linea.clave} linea={linea} />)
            )}
            {pensando ? (
              <p
                className="flex items-center gap-2 self-start rounded-2xl bg-muted px-3.5 py-2 text-sm text-muted-foreground"
                aria-live="polite"
              >
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                {t('delfines.hablar.pensando', 'Thinking…')}
              </p>
            ) : null}
            <div ref={fondo} />
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}
          <form
            className="flex items-end gap-2 rounded-3xl bg-muted p-1.5"
            onSubmit={(evento) => {
              evento.preventDefault()
              void enviar()
            }}
          >
            <textarea
              value={texto}
              rows={1}
              maxLength={8000}
              aria-label={t('delfines.hablar.campo', 'Message')}
              placeholder={t('delfines.hablar.placeholder', 'Write to it…')}
              onChange={(evento) => setTexto(evento.target.value)}
              onKeyDown={(evento) => {
                if (
                  evento.key === 'Enter' &&
                  !evento.shiftKey &&
                  !isImeOwnedKeyboardEvent(evento)
                ) {
                  evento.preventDefault()
                  void enviar()
                }
              }}
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
            />
            <button
              type="submit"
              aria-label={t('delfines.hablar.enviar', 'Send')}
              disabled={!texto.trim() || pensando}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-[transform,opacity] duration-150 ease-[cubic-bezier(.34,1.56,.64,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-90 disabled:opacity-30"
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </VentanaDeDelfin>
  )
}
