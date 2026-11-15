import { getAgentCatalog, type AgentCatalogEntry } from '@/lib/agent-catalog/agent-catalog'
import { filterEnabledTuiAgents } from '../../../../shared/agent-launch/catalog/tui-agent-selection'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'

/**
 * The agents a create-and-launch surface may offer: enabled in settings, and present on the
 * host when the host has already answered.
 *
 * `detectedAgentIds === null` means the inventory has not answered yet, which is not the same
 * as "this machine has none": offering nothing there would make a cold start look like a
 * machine with no agents installed, so the full enabled catalog shows until the answer lands.
 */
export function resolveVisibleQuickAgents(
  detectedAgentIds: ReadonlySet<TuiAgent> | null,
  disabledTuiAgents: readonly TuiAgent[]
): AgentCatalogEntry[] {
  const catalog = getAgentCatalog()
  const enabled = new Set(
    filterEnabledTuiAgents(
      catalog.map((candidate) => candidate.id),
      disabledTuiAgents
    )
  )
  return catalog.filter((agent) => {
    return enabled.has(agent.id) && (detectedAgentIds === null || detectedAgentIds.has(agent.id))
  })
}
