import { toast } from 'sonner'
import { useAppStore } from '@/store'
import {
  canOfferMoveAnywayToast,
  toastSshHostMoveRefused
} from '@/hooks/ipc-events/ssh-managed-server-refusal-toast'
import { sshTargetConnectFailureText } from './ssh-host-server-status-copy'
import { nodeMirrorRecoveryLabel } from './ssh-host-node-download-copy'
import { runNodeMirrorRecovery, thisComputerNodeMirrorRecovery } from './node-dist-mirror-recovery'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/app-shell/platform/web-client-location'
import { isOwnedSshTargetId } from '../../../shared/execution-host'

/** A host on this desktop that an agent here can reach and fix; servers' hosts and VMs are not. */
function canOfferAgentFix(targetId: string, ownerEnvironmentId: string | null): boolean {
  return !ownerEnvironmentId && !isOwnedSshTargetId(targetId) && !isWebClientLocation()
}

function agentFixAction(targetId: string, error: string) {
  return {
    label: translate('auto.components.sshHostRecovery.fixWithAgent', 'Fix it with an agent'),
    onClick: () => {
      // Loaded on demand: this toast is imported widely and the launcher pulls in the agent stack.
      void import('@/lib/agent-session/launch/vps-setup-agent-launch').then(
        ({ launchVpsSetupAgent }) => launchVpsSetupAgent({ targetId, error })
      )
    }
  }
}

/** A failed connect's toast, with the Node.js mirror recovery when the setup couldn't get Node. */
export function toastSshConnectFailure(
  targetId: string,
  error: unknown,
  fallback: string,
  ownerEnvironmentId: string | null = null
): void {
  const status = useAppStore.getState().sshConnectionStates.get(targetId)?.managedServer
  if (!ownerEnvironmentId && canOfferMoveAnywayToast(status)) {
    toastSshHostMoveRefused(targetId, status)
    return
  }
  const text = sshTargetConnectFailureText(targetId, error, fallback)
  const recovery = thisComputerNodeMirrorRecovery(status, ownerEnvironmentId)
  if (!recovery && canOfferAgentFix(targetId, ownerEnvironmentId)) {
    toast.error(text, { action: agentFixAction(targetId, text) })
    return
  }
  if (!recovery) {
    toast.error(text)
    return
  }
  toast.error(text, {
    action: {
      label: nodeMirrorRecoveryLabel(recovery),
      onClick: () => runNodeMirrorRecovery(targetId)
    }
  })
}
