import type { AgentStatusEntry, AgentStatusState } from '../../../../../shared/agent-status/contracts/agent-status-types'

/**
 * En qué anda cada compañero, leído del estado de agentes por panel.
 *
 * Por qué se proyecta a un mapa chico en vez de leer el estado entero: `agentStatusByPaneKey`
 * cambia de identidad en CADA transición de estado de toda la app (lo dice
 * `tab-agent-types-by-tab-id.ts`, que ya se quemó con eso), así que suscribir la tira al mapa
 * completo la re-renderizaría por el ruido de agentes que no son suyos. Esto devuelve solo los
 * `tabId` de la tira, y comparado por valor queda quieto mientras sus compañeros no cambien.
 *
 * La clave de panel es `${tabId}:${leafId}` y la tira no conoce la hoja activa, así que toma la
 * primera entrada de ese `tabId` —el mismo camino de respaldo que usa la barra de pestañas, válido
 * porque los id de pestaña no llevan dos puntos por construcción—. Un compañero recién abierto
 * todavía no reportó nada: no tiene estado, y la tira lo muestra sin afirmar nada de él.
 */
export function estadosDeLosTrabajos(
  agentStatusByPaneKey: Record<string, AgentStatusEntry> | undefined,
  tabIds: readonly string[]
): Record<string, AgentStatusState> {
  if (!agentStatusByPaneKey || tabIds.length === 0) {
    return {}
  }
  const buscados = new Set(tabIds)
  const estados: Record<string, AgentStatusState> = {}
  for (const [paneKey, entrada] of Object.entries(agentStatusByPaneKey)) {
    const dosPuntos = paneKey.indexOf(':')
    if (dosPuntos <= 0) {
      continue
    }
    const tabId = paneKey.slice(0, dosPuntos)
    if (!buscados.has(tabId) || estados[tabId] !== undefined) {
      continue
    }
    estados[tabId] = entrada.state
  }
  return estados
}
