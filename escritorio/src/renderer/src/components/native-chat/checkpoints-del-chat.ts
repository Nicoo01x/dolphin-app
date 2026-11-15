import { useSyncExternalStore } from 'react'
import type { CheckpointDeCodigoDato } from '../../../../shared/checkpoints-de-codigo-tipos'

/**
 * Los checkpoints de este chat: uno por turno, para poder volver al código de antes de pedir algo.
 *
 * Por qué en memoria y no en disco: lo que persiste es el checkpoint mismo —un commit suelto con su
 * ref en el repo, que sobrevive a cerrar la app—. Esto es solo la lista de «qué pedí en cada uno»,
 * que sin la conversación delante no sirve para nada.
 *
 * Por qué por pestaña y no por worktree: dos chats en el mismo proyecto son dos conversaciones, y
 * mezclar sus turnos haría que una lista ofrezca volver a un pedido que se hizo en la otra.
 */

export type CheckpointDeTurno = {
  readonly sha: string
  readonly cuando: number
  /** El pedido de ese turno, recortado: es lo que la persona reconoce en la lista. */
  readonly pedido: string
}

/** Lo que se muestra de un pedido. Más largo no entra en la lista y no ayuda a reconocerlo. */
const PEDIDO_MAXIMO = 90

/**
 * Cuántos se recuerdan por chat. Es un techo de la LISTA, no de los checkpoints del repo: los
 * commits siguen ahí con su ref. Sin techo, una sesión larga vuelve la lista inservible.
 */
const CUANTOS = 30

const porPestana = new Map<string, readonly CheckpointDeTurno[]>()
const oyentes = new Set<() => void>()
const NINGUNO: readonly CheckpointDeTurno[] = Object.freeze([])

function avisar(): void {
  for (const oyente of oyentes) {
    oyente()
  }
}

export function recortarPedido(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, ' ')
  return limpio.length > PEDIDO_MAXIMO ? `${limpio.slice(0, PEDIDO_MAXIMO - 1)}…` : limpio
}

/** Anota el checkpoint de un turno. El más nuevo queda primero. */
export function recordarCheckpointDeTurno(
  tabId: string,
  checkpoint: CheckpointDeCodigoDato,
  pedido: string
): void {
  const previos = porPestana.get(tabId) ?? NINGUNO
  if (previos.some((anterior) => anterior.sha === checkpoint.sha)) {
    return
  }
  const turno: CheckpointDeTurno = {
    sha: checkpoint.sha,
    cuando: checkpoint.cuando,
    pedido: recortarPedido(pedido)
  }
  porPestana.set(tabId, [turno, ...previos].slice(0, CUANTOS))
  avisar()
}

export function checkpointsDeLaPestana(tabId: string | null): readonly CheckpointDeTurno[] {
  return (tabId === null ? undefined : porPestana.get(tabId)) ?? NINGUNO
}

export function suscribirseACheckpoints(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

/** Solo para las pruebas. */
export function vaciarCheckpointsDelChat(): void {
  porPestana.clear()
  avisar()
}

export function useCheckpointsDelChat(tabId: string | null): readonly CheckpointDeTurno[] {
  return useSyncExternalStore(
    suscribirseACheckpoints,
    () => checkpointsDeLaPestana(tabId),
    () => NINGUNO
  )
}
