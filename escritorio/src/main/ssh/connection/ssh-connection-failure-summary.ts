import type { SshConnectionState } from '../../../shared/ssh-types'
import {
  classifySshConnectFailureText,
  SSH_CONNECT_FAILURE_NEXT_STEPS,
  type SshConnectionFailure
} from '../../../shared/ssh-connect-failure-kind'
import { sshHostServerSetupRemedy } from '../../../shared/ssh-host-server-setup-remedy'
import { unservedHostServerMessage } from '../host-server/ssh-host-unserved-status'

type RelayStatus = Extract<NonNullable<SshConnectionState['managedServer']>, { kind: 'relay' }>

const FAILED_STATUSES: ReadonlySet<SshConnectionState['status']> = new Set([
  'error',
  'auth-failed',
  'reconnection-failed'
])

const UNKNOWN_NEXT_STEP =
  'Dolphin couldn’t tell why the connection failed. Run ssh to this host in a terminal on this computer to see SSH’s own error, fix what it names, then connect again.'

function relayReason(server: RelayStatus): string {
  if (server.nodeDownloadBlocked) {
    return 'server:node-download-blocked'
  }
  if (server.contactLost) {
    return 'server:contact-lost'
  }
  if (server.held) {
    return 'server:move-held'
  }
  switch (server.reason) {
    case 'dolphind_unavailable':
      return `server:unavailable:${server.detail ?? 'unknown'}`
    case 'failed':
    case 'deferred':
      return `server:setup-${sshHostServerSetupRemedy(server.code)}`
    default:
      return `server:${server.reason}`
  }
}

/**
 * Why this state is a failure, in words safe for any client: the managed server's own reason when
 * it is the server that stopped, otherwise SSH's failure kind. Null when nothing failed.
 */
export function summarizeSshConnectionFailure(
  state: Pick<SshConnectionState, 'status' | 'error' | 'managedServer'>
): SshConnectionFailure | null {
  const server = state.managedServer
  if (server?.kind === 'relay') {
    const { kind: _kind, ...decision } = server
    return {
      reason: relayReason(server),
      nextStep: unservedHostServerMessage({ route: 'unserved', ...decision })
    }
  }
  if (!FAILED_STATUSES.has(state.status)) {
    return null
  }
  const kind = state.error ? classifySshConnectFailureText(state.error) : null
  if (kind) {
    return { reason: kind, nextStep: SSH_CONNECT_FAILURE_NEXT_STEPS[kind] }
  }
  return state.status === 'auth-failed'
    ? { reason: 'auth', nextStep: SSH_CONNECT_FAILURE_NEXT_STEPS.auth }
    : { reason: 'unknown', nextStep: UNKNOWN_NEXT_STEP }
}
