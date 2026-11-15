import { useEffect, useRef } from 'react'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'
import { isTuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent-config'
import { delegarEnTrabajos, type TrabajoDelegado } from './delegar-en-trabajos'
import { firmaDeLaPropuesta, type PropuestaDeDelegacion } from './propuesta-de-delegacion'

/**
 * Delegar sin preguntar, cuando la persona lo pidió.
 *
 * Con el interruptor de Ajustes prendido, apenas el líder parte la tarea los compañeros se abren
 * solos: ya dijiste que sí una vez y no hace falta decirlo en cada plan. Apagado, no hace nada y la
 * ventana sigue preguntando como siempre.
 *
 * Why una sola vez por propuesta, y por firma: abrir compañeros gasta plata, así que un segundo
 * disparo no es una molestia, es una cuenta. La firma es la del plan, no el id del mensaje: el
 * mensaje del líder llega de a pedazos y su id cambia mientras llega, así que con el id esto
 * delegaría de nuevo con cada trozo de texto que entra.
 *
 * Y recuerda lo ya delegado aunque la propuesta desaparezca y vuelva: el mismo plan que vuelve a
 * aparecer —porque se re-renderizó el chat o volviste a la pestaña— no abre un segundo equipo.
 */
export function useDelegacionAutomatica({
  prendida,
  propuesta,
  agente,
  worktreeId,
  alDelegar
}: {
  prendida: boolean
  propuesta: PropuestaDeDelegacion | null
  agente: AgentType
  worktreeId: string | null
  /** Qué hacer con los trabajos abiertos; la ventana los muestra para poder ir a cada uno. */
  alDelegar: (firma: string, trabajos: readonly TrabajoDelegado[]) => void
}): void {
  const yaDelegadas = useRef<Set<string>>(new Set())
  const alDelegarRef = useRef(alDelegar)
  alDelegarRef.current = alDelegar

  const firma = propuesta === null ? null : firmaDeLaPropuesta(propuesta)

  useEffect(() => {
    if (!prendida || propuesta === null || firma === null || worktreeId === null) {
      return
    }
    if (!isTuiAgent(agente) || yaDelegadas.current.has(firma)) {
      return
    }
    // Se marca ANTES de abrir: si abrir tarda, un re-render en el medio no puede largar otro equipo.
    yaDelegadas.current.add(firma)
    const trabajos = delegarEnTrabajos({
      agente,
      worktreeId,
      // Sin tocar nada van todas, igual que cuando lo aprobás a mano: el plan ya es lo que el
      // líder decidió hacer.
      tareas: propuesta.tareas
    })
    alDelegarRef.current(firma, trabajos)
  }, [agente, firma, prendida, propuesta, worktreeId])
}
