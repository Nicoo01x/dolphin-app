import { launchAgentInNewTabWithOutcome } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import { useAppStore } from '@/store'
import { isTuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent-config'
import { createNonSecureContextUuid } from '../../../../../shared/non-secure-context-uuid'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'
import type { TareaParaDelegar } from './propuesta-de-delegacion'
// El `import type` de vuelta en ese módulo se borra al compilar, así que esto no es un ciclo real.
import { recordarTrabajos } from './trabajos-delegados'

/** Una tarea del plan que ya es un trabajo del proyecto, y en qué pestaña quedó. */
export type TrabajoDelegado = {
  readonly tareaId: string
  readonly titulo: string
  readonly tabId: string
}

export type PedidoDeDelegacion = {
  /** El mismo motor que pensó el plan: cambiarlo a mitad de camino es otra decisión. */
  readonly agente: AgentType
  readonly worktreeId: string
  readonly tareas: readonly TareaParaDelegar[]
}

/**
 * Abre cada tarea elegida como un trabajo del proyecto: una pestaña por tarea, con el mismo motor y
 * el pedido ya adentro.
 *
 * `activate: false` a propósito: crear cuatro compañeros no te saca del chat del líder, que es lo
 * que estabas leyendo. A cada uno se va con su botón, y eso es lo que vuelve esto una ventana con
 * la que se cambia de trabajo y no un salto.
 *
 * Reusa `launchAgentInNewTabWithOutcome`, el mismo camino del «+» y de los atajos: un segundo camino para
 * largar un agente es un segundo lugar donde arreglar los permisos, el worktree y el remoto.
 */
export function delegarEnTrabajos({
  agente,
  worktreeId,
  tareas
}: PedidoDeDelegacion): TrabajoDelegado[] {
  if (!isTuiAgent(agente)) {
    return []
  }
  const abiertos: TrabajoDelegado[] = []
  for (const tarea of tareas) {
    const resultado = launchAgentInNewTabWithOutcome({
      requestId: createNonSecureContextUuid(),
      agent: agente,
      worktreeId,
      prompt: tarea.pedido,
      // El compañero arranca solo: delegar y que el pedido quede sin enviar no es delegar.
      promptDelivery: 'submit-after-ready',
      launchSource: 'orchestration',
      activate: false
    })
    // Un rechazo ya lo avisó el lanzador; acá sólo no hay pestaña que anotar.
    const superficie = resultado && !('refused' in resultado) ? resultado.surface : undefined
    // Un agente que el host publica no deja una pestaña de este lado, así que no hay a dónde ir.
    if (superficie && superficie.kind !== 'host-published') {
      abiertos.push({ tareaId: tarea.id, titulo: tarea.titulo, tabId: superficie.tabId })
    }
  }
  // Acá y no en quien llama: por este punto pasan las dos delegaciones —el botón y la automática—,
  // y lo que hace que la tira de compañeros sobreviva al cierre de la ventana es quedar anotado.
  recordarTrabajos(worktreeId, abiertos)
  return abiertos
}

/** Cambiar de ventana: la pestaña del trabajo pasa al frente, en su propio proyecto. */
export function irAlTrabajo(worktreeId: string, tabId: string): void {
  const store = useAppStore.getState()
  store.activateTab(tabId, { worktreeId })
  // Sin esto la pestaña queda activa detrás de un editor abierto y parece que no pasó nada.
  store.setActiveTabType('terminal', worktreeId)
}
