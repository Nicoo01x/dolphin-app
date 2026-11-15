import { useCallback, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import { NativeChatQueuedMessageRows } from '@/components/native-chat/queue/NativeChatQueuedMessageRows'
import type { QueuedMessageReorder } from '@/components/native-chat/queue/use-structured-agent-session-queued-reorder'
import type { QueuedMessageCard } from '../../../../../../shared/agent-session/view/structured-agent-session-queued-cards'
import { FilaEnCola, type AccionDeFila } from './FilaEnCola'
import { useVaciadoDeLaCola } from './use-cola-del-chat'
import {
  mover,
  reanudar,
  restaurar,
  type EstadoDeCola,
  type MensajeEnCola,
  type MensajeQuitado,
  type MotivoDePausa
} from './cola-del-chat-modelo'
import {
  cambiarCola,
  claveDeCola,
  entregarDeLaCola,
  leerCola,
  quitarDeLaCola
} from './cola-del-chat-store'

/** Lo que tarda una fila borrada en cerrarse; con «reducir movimiento» sale en el acto. */
const CIERRE_DE_FILA_MS = 150
const DESHACER_MS = 5_000

/**
 * La cola de Dolphin del chat sobre el CLI, arriba del composer: lo que la persona mandó mientras
 * el agente trabajaba y todavía no le llegó. Cada fila se puede mandar ya o borrar.
 */
export function ColaDelChat({
  paneKey,
  agent,
  trabajando,
  puedeRecibir
}: {
  paneKey: string
  agent: string
  /** El agente está generando: lo que se manda ahora espera acá. */
  trabajando: boolean
  /** El turno terminó, no hay pregunta abierta y el CLI acepta escritura: sale el primero. */
  puedeRecibir: boolean
}): React.JSX.Element | null {
  const t = useTranslate()
  const clave = claveDeCola(paneKey, agent)
  const estado = useVaciadoDeLaCola(clave, { trabajando, puedeRecibir })
  const [salientes, setSalientes] = useState<readonly MensajeQuitado[]>([])
  const sinMovimiento = useRef(prefiereSinMovimiento())
  const listaRef = useRef<HTMLUListElement>(null)
  // La fila que se va se lleva el foco: pasa a la vecina con el mismo botón, o al chat.
  const conFoco = useCallback(
    (id: string, accion: AccionDeFila, hacer: () => void) => {
      const lista = listaRef.current
      const teniaFoco = lista?.contains(document.activeElement) === true
      const vecina = vecinaDe(leerCola(clave).mensajes, id)
      hacer()
      if (lista && teniaFoco) {
        requestAnimationFrame(() => devolverFoco(lista, vecina, accion))
      }
    },
    [clave]
  )
  const borrar = useCallback(
    (id: string) => {
      const quitado = quitarDeLaCola(clave, id)
      if (!quitado) {
        return
      }
      if (!sinMovimiento.current) {
        setSalientes((antes) => [...antes, quitado])
        setTimeout(
          () => setSalientes((antes) => antes.filter((fila) => fila !== quitado)),
          CIERRE_DE_FILA_MS
        )
      }
      toast(t('components.dolphin.chat.cola.borrado', 'Removed from the queue'), {
        duration: DESHACER_MS,
        action: {
          label: t('components.dolphin.chat.cola.deshacer', 'Undo'),
          onClick: () => cambiarCola(clave, (actual) => restaurar(actual, quitado))
        }
      })
    },
    [clave, t]
  )
  const reorder = useMemo<QueuedMessageReorder>(
    () => ({
      scope: clave,
      pending: false,
      move: async (id, ancla) => {
        cambiarCola(clave, (actual) =>
          ancla.afterMessageId !== undefined
            ? mover(actual, id, { despuesDe: ancla.afterMessageId })
            : ancla.beforeMessageId !== null
              ? mover(actual, id, { antesDe: ancla.beforeMessageId })
              : actual
        )
      }
    }),
    [clave]
  )
  const tarjetas = useMemo(() => tarjetasDeLaCola(estado, salientes), [estado, salientes])
  if (tarjetas.length === 0) {
    return null
  }
  const salienteIds = new Set(salientes.map((fila) => fila.mensaje.id))
  return (
    <div className="mx-auto w-full max-w-(--chat-content-max-width) px-4 pb-1">
      <section
        aria-label={t('components.dolphin.chat.cola.titulo', 'Queued messages')}
        className="rounded-lg bg-card p-1 text-card-foreground"
      >
        <CabezaDeLaCola
          cantidad={estado.mensajes.length}
          pausa={estado.pausa}
          onReanudar={() => cambiarCola(clave, reanudar)}
          t={t}
        />
        <ul ref={listaRef} className="scrollbar-sleek max-h-40 overflow-y-auto">
          <NativeChatQueuedMessageRows
            cards={tarjetas}
            reorder={reorder}
            renderCard={(card, drag) => (
              <FilaEnCola
                key={card.messageId}
                card={card}
                drag={drag}
                saliendo={salienteIds.has(card.messageId)}
                trabajando={trabajando}
                onEnviarAhora={() =>
                  conFoco(card.messageId, 'enviar', () => entregarDeLaCola(clave, card.messageId))
                }
                onBorrar={() => conFoco(card.messageId, 'borrar', () => borrar(card.messageId))}
              />
            )}
          />
        </ul>
      </section>
    </div>
  )
}

function CabezaDeLaCola({
  cantidad,
  pausa,
  onReanudar,
  t
}: {
  cantidad: number
  pausa: MotivoDePausa | null
  onReanudar: () => void
  t: Translate
}): React.JSX.Element {
  // pl de 30: alinea con el texto de las filas (asa de 20 + márgenes), sin repetir su ícono.
  return (
    <div className="flex h-6 items-center gap-1.5 pr-0.5 pl-[30px] text-xs text-muted-foreground">
      <span className="shrink-0">
        {pausa
          ? t('components.dolphin.chat.cola.enPausa', 'Paused')
          : t('components.dolphin.chat.cola.enCola', 'Queued')}
      </span>
      <span aria-hidden>·</span>
      <span className="shrink-0 tabular-nums">{cantidad}</span>
      <span className="min-w-0 flex-1 truncate" title={pausa ? motivoDePausa(pausa, t) : undefined}>
        {pausa ? motivoDePausa(pausa, t) : null}
      </span>
      {pausa ? (
        <Button type="button" variant="ghost" size="xs" onClick={onReanudar}>
          <Play className="size-3" />
          {t('components.dolphin.chat.cola.reanudar', 'Resume')}
        </Button>
      ) : null}
    </div>
  )
}

function motivoDePausa(motivo: MotivoDePausa, t: Translate): string {
  switch (motivo) {
    case 'detenido':
      return t('components.dolphin.chat.cola.pausaDetenido', 'You stopped the agent')
    case 'restaurada':
      return t('components.dolphin.chat.cola.pausaRestaurada', 'Kept from before Dolphin closed')
    case 'noSalio':
      return t('components.dolphin.chat.cola.pausaNoSalio', "Couldn't send. Try Send now")
  }
}

/** Las filas que la base sabe ordenar, con las recién borradas en su lugar mientras se cierran. */
export function tarjetasDeLaCola(
  estado: EstadoDeCola,
  salientes: readonly MensajeQuitado[]
): QueuedMessageCard[] {
  const hold: QueuedMessageCard['hold'] = estado.pausa ? 'queue-paused' : 'turn'
  const tarjetas: QueuedMessageCard[] = estado.mensajes.map((mensaje, position) => ({
    messageId: mensaje.id,
    position,
    text: mensaje.texto,
    state: 'waiting',
    hold,
    ...(mensaje.imagenes.length > 0
      ? {
          images: mensaje.imagenes.map((path) => ({
            type: 'image-ref' as const,
            path
          }))
        }
      : {})
  }))
  for (const { mensaje, indice } of salientes) {
    if (tarjetas.some((tarjeta) => tarjeta.messageId === mensaje.id)) {
      continue
    }
    // 'sending' la deja fuera del arrastre mientras se cierra.
    tarjetas.splice(Math.min(indice, tarjetas.length), 0, {
      messageId: mensaje.id,
      position: indice,
      text: mensaje.texto,
      state: 'waiting',
      hold: 'sending'
    })
  }
  return tarjetas
}

function vecinaDe(mensajes: readonly MensajeEnCola[], id: string): string | null {
  const indice = mensajes.findIndex((mensaje) => mensaje.id === id)
  return (mensajes[indice + 1] ?? mensajes[indice - 1])?.id ?? null
}

function devolverFoco(lista: HTMLElement, vecina: string | null, accion: AccionDeFila): void {
  const boton = vecina
    ? lista.querySelector<HTMLButtonElement>(
        `[data-cola-del-chat-id="${CSS.escape(vecina)}"] [data-accion="${accion}"]:not(:disabled)`
      )
    : null
  if (boton) {
    boton.focus()
    return
  }
  // Sin vecina, al chat: su raíz manda lo que se escriba al composer.
  lista.closest<HTMLElement>('[data-native-chat-root]')?.focus()
}

function prefiereSinMovimiento(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  } catch {
    return false
  }
}
