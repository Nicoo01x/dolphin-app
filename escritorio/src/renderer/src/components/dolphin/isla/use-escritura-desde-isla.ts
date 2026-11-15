import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { sendNativeChatMessage } from '../../native-chat/session/terminal/send/native-chat-runtime-send'
import type {
  PedidoDeEscritura,
  ResultadoDeEscritura
} from '../../../../../shared/dolphin-isla-types'

/**
 * Cuánto espera esta ventana que la terminal confirme. Es menos que lo que espera main (ver
 * dolphin-isla-escritura.ts): así main nunca se rinde antes y no queda un envío vivo después de que
 * la isla mostró el resultado.
 */
export const TOPE_DE_ENVIO_MS = 25_000

/** Si el agente de ese pane espera que apruebes o elijas algo: un Enter lo contestaría. */
export function esperaQueLeContesten(paneKey: string): boolean {
  const estado = useAppStore.getState().agentStatusByPaneKey?.[paneKey]
  return (
    Boolean(estado?.interactivePrompt) || estado?.state === 'blocked' || estado?.state === 'waiting'
  )
}

/**
 * Tipea en la terminal del agente lo que se escribió en la isla, con el envío observado del chat:
 * limpia la línea, pega el texto y manda el Enter aparte, en la fila de esa terminal y pidiéndole a
 * la terminal que confirme cada escritura. Con las protecciones del chat: si el agente espera una
 * aprobación no se escribe nada, y si la abre en el medio el Enter no sale (y no se tipea nada
 * debajo del diálogo: el próximo envío limpia la línea).
 */
export function escribirAlAgente(pedido: PedidoDeEscritura): Promise<ResultadoDeEscritura> {
  if (esperaQueLeContesten(pedido.paneKey)) {
    return Promise.resolve({ ok: false, motivo: 'aprobacion' })
  }
  return new Promise((resolver) => {
    let terminado = false
    let sinConfirmar = false
    let soltar: () => void = () => {}
    let tope: ReturnType<typeof setTimeout> | undefined
    const terminar = (resultado: ResultadoDeEscritura): void => {
      if (terminado) {
        return
      }
      terminado = true
      soltar()
      clearTimeout(tope)
      resolver(resultado)
    }
    const envio = sendNativeChatMessage(pedido.ptyId, pedido.texto, {
      onWriteRejected: () => terminar({ ok: false, motivo: 'no-llego' }),
      onWriteUnconfirmed: () => {
        sinConfirmar = true
      },
      onDeliverySettled: (confirmado) =>
        terminar(
          confirmado
            ? { ok: true }
            : { ok: false, motivo: sinConfirmar ? 'sin-confirmar' : 'no-llego' }
        )
    })
    soltar = useAppStore.subscribe(() => {
      if (!terminado && esperaQueLeContesten(pedido.paneKey)) {
        envio.cancel(true)
        terminar({ ok: false, motivo: 'aprobacion' })
      }
    })
    tope = setTimeout(() => {
      // Si todavía esperaba su turno detrás de otro envío, no se escribió nada: no llegó. Si ya
      // empezó a escribir, pudo haber llegado y no saberse: mejor decirlo que invitar a mandarlo
      // dos veces.
      const empezo = envio.bodyStarted?.() ?? true
      envio.cancel(true)
      terminar({ ok: false, motivo: empezo ? 'sin-confirmar' : 'no-llego' })
    }, TOPE_DE_ENVIO_MS)
  })
}

/** Lo que se escribe en la isla lo tipea esta ventana, donde están las terminales, y contesta cómo le fue. */
export function useEscrituraDesdeIsla(): void {
  useEffect(
    // ?. por la recarga en caliente: un preload viejo no tiene el método hasta reiniciar la app.
    () =>
      window.api.dolphin?.onEscribirDesdeIsla?.((pedido) => {
        void escribirAlAgente(pedido).then((resultado) =>
          window.api.dolphin.confirmarEscrituraDesdeIsla?.({ id: pedido.id, resultado })
        )
      }),
    []
  )
}
