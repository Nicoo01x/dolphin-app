import { randomUUID } from 'node:crypto'
import type {
  EscrituraDesdeIsla,
  PedidoDeEscritura,
  RespuestaDeEscritura,
  ResultadoDeEscritura
} from '../../shared/dolphin-isla-types'

/**
 * Cuánto se espera que la ventana principal diga si llegó. Más que su propio tope (25 s, ver
 * use-escritura-desde-isla.ts): la que se rinde primero es ella, que puede cortar el envío; si main
 * se rindiera antes, la isla diría un resultado mientras el envío sigue vivo.
 */
const ESPERA_MAXIMA_MS = 35_000

const pendientes = new Map<string, (resultado: ResultadoDeEscritura) => void>()

/**
 * Le pide a la ventana principal que tipee lo escrito en la isla y espera que conteste cómo le fue:
 * «Se lo mandé» tiene que querer decir que la terminal lo aceptó, no que main lo reenvió.
 * `enviar` devuelve false cuando no hay a quién mandárselo.
 */
export function pedirEscritura(
  enviar: (pedido: PedidoDeEscritura) => boolean,
  escritura: EscrituraDesdeIsla,
  esperaMs = ESPERA_MAXIMA_MS
): Promise<ResultadoDeEscritura> {
  const id = randomUUID()
  return new Promise((resolver) => {
    const vencido = setTimeout(() => {
      if (pendientes.delete(id)) {
        resolver({ ok: false, motivo: 'sin-confirmar' })
      }
    }, esperaMs)
    vencido.unref?.()
    pendientes.set(id, (resultado) => {
      clearTimeout(vencido)
      resolver(resultado)
    })
    if (!enviar({ ...escritura, id })) {
      recibirRespuestaDeEscritura({ id, resultado: { ok: false, motivo: 'no-llego' } })
    }
  })
}

/** La ventana principal contesta cómo le fue; una respuesta de un pedido vencido no hace nada. */
export function recibirRespuestaDeEscritura(respuesta: RespuestaDeEscritura): void {
  const resolver = pendientes.get(respuesta.id)
  if (resolver) {
    pendientes.delete(respuesta.id)
    resolver(respuesta.resultado)
  }
}
