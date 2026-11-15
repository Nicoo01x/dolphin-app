import {
  formatDolphinSessionAddress,
  isDolphinSessionId
} from '../../../../../shared/dolphin-session-address'
import type { OrchestrationSessionAddressResult } from '../../../../../shared/orchestration/orchestration-caller-status'
import { callRuntimeRpc } from '../../rpc/calls/runtime-rpc-call'
import { RuntimeRpcCallError } from '../../rpc/calls/runtime-rpc-result'
import type { RuntimeClientTarget } from '../../../../../shared/runtime-client-target'

/**
 * A chat's Dolphin session ID: its `/clear` root's, which the host derives from the session records.
 * Null for an id that is not a Dolphin session id.
 */
export async function resolveStructuredSessionDolphinSessionId(
  target: RuntimeClientTarget,
  sessionId: string
): Promise<string | null> {
  if (!isDolphinSessionId(sessionId)) {
    return null
  }
  try {
    const result = await callRuntimeRpc<OrchestrationSessionAddressResult>(
      target,
      'orchestration.sessionAddress',
      { sessionId }
    )
    return result.dolphinSessionId
  } catch (error) {
    // Why: a host that predates the method routes the current session's ID to the same chat.
    if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
      return formatDolphinSessionAddress(sessionId)
    }
    throw error
  }
}
