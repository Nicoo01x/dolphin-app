import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { unwrapRuntimeRpcResult } from '@/runtime/rpc/calls/runtime-rpc-result'
import { withUiConnectTimeout } from '@/ssh/ssh-connect-ui-timeout'
import { isSshConnectInFlight, trackSshConnect } from '@/ssh/ssh-connect-in-flight'
import { translate } from '@/i18n/i18n'
import type { RuntimeStatus } from '../../../../shared/runtime-types'
import type { NeedsProjectHostOption } from './new-workspace-composer-card-props'

/**
 * Bring a run target online from a picker row, for the host the user just chose.
 *
 * Shared by every surface that offers run targets — the workspace composer and the start
 * composer on the landing screen — because "connect" is the same two cases everywhere: an SSH
 * target dials out, and a Dolphin server is asked for its status, which is what wakes it.
 *
 * The runtime branch re-reads the host status snapshots on failure as well as on success: a
 * status call that times out still changes what the app knows about that host, and leaving the
 * old snapshot in place showed a machine as reachable right after it refused to answer.
 */
export async function connectRunTargetHost(option: NeedsProjectHostOption): Promise<void> {
  const action = option.connectAction
  if (!action) {
    return
  }
  try {
    if (action.kind === 'ssh') {
      if (isSshConnectInFlight(action.targetId)) {
        return
      }
      await withUiConnectTimeout(
        trackSshConnect(action.targetId, window.api.ssh.connect({ targetId: action.targetId }))
      )
      return
    }
    const response = await window.api.runtimeEnvironments.getStatus({
      selector: action.environmentId,
      timeoutMs: 15_000
    })
    unwrapRuntimeRpcResult<RuntimeStatus>(response)
    await useAppStore.getState().readRuntimeHostStatusSnapshots()
  } catch (error) {
    if (action.kind === 'runtime') {
      await useAppStore.getState().readRuntimeHostStatusSnapshots()
    }
    toast.error(
      error instanceof Error
        ? error.message
        : translate(
            'auto.components.NewWorkspaceComposerCard.hostConnectionFailed',
            'Connection failed'
          )
    )
  }
}
