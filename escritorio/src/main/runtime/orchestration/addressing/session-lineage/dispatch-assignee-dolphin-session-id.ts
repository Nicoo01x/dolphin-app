import {
  parseDolphinSessionAddress,
  type DolphinSessionId
} from '../../../../../shared/dolphin-session-address'
import { structuredWorkerDolphinSessionIdForIncarnation } from '../../terminal-authority/structured-sessions/structured-worker-identity'
import { canonicalDolphinSessionId } from './canonical-dolphin-session-id'

/** Resolve structured incarnations or chat addresses to bare session ids; PTYs have none. */
export function dispatchAssigneeDolphinSessionId(assignee: {
  handle: string
  processIncarnation: string | null | undefined
}): DolphinSessionId | null {
  const dolphinSessionId =
    structuredWorkerDolphinSessionIdForIncarnation(assignee.processIncarnation) ??
    parseDolphinSessionAddress(assignee.handle)
  return dolphinSessionId === null ? null : canonicalDolphinSessionId(dolphinSessionId)
}
