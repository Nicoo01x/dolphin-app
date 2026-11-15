import type { AgentMessageSender } from '../../../../../shared/agent-session/agent-session-message-source'
import { readWorkerTerminalHostScope } from '../../../../../shared/orchestration/workers/worker-terminal-host-scope'
import type { OrchestrationDb } from '../../db/orchestration-db'
import type { DispatchContextRow } from '../../db/orchestration-records'
import { canonicalDolphinSessionId } from '../../addressing/session-lineage/canonical-dolphin-session-id'
import { resolveOrchestrationParty } from '../../addressing/orchestration-party'
import { runCoordinatorKey } from '../../addressing/orchestration-caller-identity'

type Party = Pick<AgentMessageSender['party'], 'terminalHandle' | 'dolphinSessionId'>

function sameParty(a: Party, b: Party): boolean {
  if (a.dolphinSessionId && b.dolphinSessionId) {
    return canonicalDolphinSessionId(a.dolphinSessionId) === canonicalDolphinSessionId(b.dolphinSessionId)
  }
  return Boolean(a.terminalHandle && a.terminalHandle === b.terminalHandle)
}

function localDispatch(dispatch: DispatchContextRow): boolean {
  const scope = readWorkerTerminalHostScope(dispatch.host_scope)
  return scope.kind === 'absent' || (scope.kind === 'local' && scope.id === 'local')
}

/** Delivery-time evidence only; missing, ambiguous or foreign lineage is unknown. */
export function agentMessageRelation(args: {
  db: OrchestrationDb | null
  sender: AgentMessageSender['party']
  recipient: string
  runId: string
  reportedDispatchId?: string
  recipientDispatchId: string | null
}): AgentMessageSender['relation'] {
  try {
    const { db, sender, runId } = args
    if (!db || sender.address.startsWith('dispatch:') || args.recipient.startsWith('dispatch:')) {
      return undefined
    }
    const run = db.getRun(runId)
    if (!run) {
      return undefined
    }
    const recipient =
      args.recipient === `run:${runId}`
        ? runCoordinatorKey(run)
        : resolveOrchestrationParty(args.recipient, db)
    const coordinator = runCoordinatorKey(run)
    const dispatchFor = (party: Party, id?: string | null) => {
      const candidates = id
        ? [db.getDispatchContextById(id)]
        : db.getActiveDispatchMailboxOwners(
            party.terminalHandle ??
              (party.dolphinSessionId ? `orca_session_id:${party.dolphinSessionId}` : '')
          )
      const matches = candidates.filter((row): row is DispatchContextRow =>
        Boolean(
          row &&
          row.run_id === runId &&
          localDispatch(row) &&
          sameParty(party, {
            terminalHandle: row.assignee_handle,
            dolphinSessionId: row.assignee_orca_session_id
          })
        )
      )
      return matches.length === 1 ? matches[0] : undefined
    }
    const parentOf = (dispatch: DispatchContextRow | undefined): Party | undefined => {
      if (!dispatch) {
        return undefined
      }
      if (dispatch.creator_handle || dispatch.creator_orca_session_id) {
        return {
          terminalHandle: dispatch.creator_handle,
          dolphinSessionId: dispatch.creator_orca_session_id
        }
      }
      if (dispatch.creator_dispatch_id) {
        const creator = db.getDispatchContextById(dispatch.creator_dispatch_id)
        return creator && creator.run_id === runId && localDispatch(creator)
          ? {
              terminalHandle: creator.assignee_handle,
              dolphinSessionId: creator.assignee_orca_session_id
            }
          : undefined
      }
      return undefined
    }
    const senderDispatch = dispatchFor(sender, args.reportedDispatchId)
    const recipientDispatch = dispatchFor(recipient, args.recipientDispatchId)
    const senderParent = parentOf(senderDispatch)
    const recipientParent = parentOf(recipientDispatch)
    if (!sameParty(sender, recipient)) {
      if (senderParent && sameParty(senderParent, recipient)) {
        return 'worker'
      }
      if (recipientParent && sameParty(recipientParent, sender)) {
        return 'coordinator'
      }
    }
    return (senderParent || sameParty(sender, coordinator)) &&
      (recipientParent || sameParty(recipient, coordinator))
      ? 'none'
      : undefined
  } catch {
    // Lineage is informational; an unavailable database must never block delivery.
    return undefined
  }
}
