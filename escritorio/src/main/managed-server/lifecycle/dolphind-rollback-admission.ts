import type { DolphindTerminalCensus } from '../../../shared/dolphind-terminal-census'
import type { DolphindRollbackResult } from '../install/dolphind-remote-rollback'

export function rollbackRecountRefusal(
  census: DolphindTerminalCensus
): DolphindRollbackResult | null {
  const live = census.liveSessions
  if (live === 0) {
    return null
  }
  return {
    outcome: 'refused',
    code:
      live === null
        ? 'dolphind_rollback_census_unavailable'
        : 'dolphind_rollback_terminals_running',
    reason:
      live === null
        ? 'The server did not answer how many terminals it runs. Retry when it answers.'
        : 'A terminal opened on this server before it could be stopped; close it, then retry.'
  }
}

export const ROLLBACK_STALE_COUNT: DolphindRollbackResult = {
  outcome: 'refused',
  code: 'dolphind_rollback_census_unavailable',
  reason: 'The terminal count went stale before the server could be stopped. Retry the rollback.'
}
