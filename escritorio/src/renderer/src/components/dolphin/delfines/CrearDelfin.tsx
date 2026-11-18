import { useId, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import type { InstantaneaDeDelfin, PlantillaDeDelfin } from '../../../../../shared/delfines-types'
import { ORDEN_DE_PLANTILLAS } from './delfines-formato'
import {
  ICONO_DE_PLANTILLA,
  nombreDePlantilla,
  nombreSugerido,
  queHacePlantilla
} from './plantillas-de-delfin'
import { BOTON_PRINCIPAL, CAMPO, VentanaDeDelfin } from './VentanaDeDelfin'

/**
 * Crear un delfín: se elige la plantilla (el nombre se propone solo), y opcionalmente dónde
 * trabaja. Lo crea el núcleo (`dolphin bots nuevo --plantilla`); un nombre repetido vuelve como
 * error y la ventana sigue abierta para cambiarlo.
 */
export function CrearDelfin({
  nace,
  inicial,
  onCerrar,
  onCreado
}: {
  nace: DOMRect | null
  inicial?: PlantillaDeDelfin
  onCerrar: () => void
  onCreado: (bot: InstantaneaDeDelfin) => void
}): React.JSX.Element {
  const t = useTranslate()
  const idNombre = useId()
  const idCarpeta = useId()
  const [plantilla, setPlantilla] = useState<PlantillaDeDelfin>(inicial ?? 'vigia')
  const [nombre, setNombre] = useState(nombreSugerido(inicial ?? 'vigia'))
  const [tocado, setTocado] = useState(false)
  const [carpeta, setCarpeta] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const elegir = (otra: PlantillaDeDelfin): void => {
    setPlantilla(otra)
    // El nombre sigue a la plantilla hasta que la persona escribe el suyo.
    if (!tocado) {
      setNombre(nombreSugerido(otra))
    }
  }

  const crear = async (): Promise<void> => {
    const api = window.api?.delfines
    if (!api || !nombre.trim()) {
      return
    }
    setEnviando(true)
    setError(null)
    const resultado = await api
      .crear({
        nombre: nombre.trim(),
        plantilla,
        ...(carpeta.trim() ? { carpeta: carpeta.trim() } : {})
      })
      .catch((causa: unknown) => ({
        ok: false as const,
        code: 'nucleo' as const,
        detail: causa instanceof Error ? causa.message : String(causa)
      }))
    setEnviando(false)
    if (resultado.ok) {
      onCreado(resultado.bot)
      return
    }
    setError(
      resultado.code === 'pedido-invalido'
        ? t(
            'delfines.crear.nombreInvalido',
            'The name needs letters or numbers, and cannot start with a dash.'
          )
        : (resultado.detail ?? t('delfines.crear.error', 'Could not create it. Try again.'))
    )
  }

  return (
    <VentanaDeDelfin
      titulo={t('delfines.crear.titulo', 'New dolphin')}
      nace={nace}
      onCerrar={onCerrar}
    >
      {() => (
        <form
          className="flex flex-col gap-5"
          onSubmit={(evento) => {
            evento.preventDefault()
            void crear()
          }}
        >
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">{t('delfines.crear.plantilla', 'Template')}</legend>
            {ORDEN_DE_PLANTILLAS.map((opcion) => {
              const Icono = ICONO_DE_PLANTILLA[opcion]
              const elegida = opcion === plantilla
              return (
                <button
                  key={opcion}
                  type="button"
                  aria-pressed={elegida}
                  onClick={() => elegir(opcion)}
                  className={cn(
                    'flex min-w-0 flex-col items-start gap-2 rounded-2xl p-3 text-left transition-[transform,background-color] duration-150 ease-[cubic-bezier(.34,1.56,.64,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[.97]',
                    elegida ? 'bg-foreground text-background' : 'bg-muted hover:bg-accent'
                  )}
                >
                  <Icono className="size-5" aria-hidden="true" />
                  <span className="text-sm font-medium">{nombreDePlantilla(opcion)}</span>
                  <span
                    className={cn(
                      'text-xs',
                      elegida ? 'text-background/70' : 'text-muted-foreground'
                    )}
                  >
                    {queHacePlantilla(opcion)}
                  </span>
                </button>
              )
            })}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={idNombre} className="text-[13px] font-medium">
              {t('delfines.crear.nombre', 'Name')}
            </label>
            <input
              id={idNombre}
              className={CAMPO}
              value={nombre}
              maxLength={80}
              autoComplete="off"
              onChange={(evento) => {
                setTocado(true)
                setNombre(evento.target.value)
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={idCarpeta} className="text-[13px] font-medium">
              {t('delfines.crear.carpeta', 'Where it works')}
            </label>
            <input
              id={idCarpeta}
              className={CAMPO}
              value={carpeta}
              placeholder={t('delfines.crear.carpetaVacia', 'Your home folder')}
              autoComplete="off"
              spellCheck={false}
              onChange={(evento) => setCarpeta(evento.target.value)}
            />
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-2xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <button type="submit" className={BOTON_PRINCIPAL} disabled={enviando || !nombre.trim()}>
              {enviando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {t('delfines.crear.crear', 'Create')}
            </button>
          </div>
        </form>
      )}
    </VentanaDeDelfin>
  )
}
