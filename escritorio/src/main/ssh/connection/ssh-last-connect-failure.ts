import type { SshConnectionState } from '../../../shared/ssh-types'
import type { SshConnectionFailure } from '../../../shared/ssh-connect-failure-kind'
import { summarizeSshConnectionFailure } from './ssh-connection-failure-summary'

/**
 * The last failure each host published, until it connects again.
 *
 * Why remember it: a failed connect closes its session, so the connection manager's state goes
 * back to nothing and `ssh.getState` would answer as if no connect had been tried. An agent
 * asked to fix a host (`dolphin host doctor`) needs the reason the user just saw, not that.
 * Only the summary is kept, never SSH's raw words.
 */
const lastFailures = new Map<string, SshConnectionFailure>()

/** Called with every state main publishes for a host. */
export function noteSshStateForLastFailure(targetId: string, state: SshConnectionState): void {
  const failure = summarizeSshConnectionFailure(state)
  if (failure) {
    lastFailures.set(targetId, failure)
    return
  }
  if (state.status === 'connected') {
    lastFailures.delete(targetId)
  }
}

/** A connect that threw before publishing anything still leaves its reason behind. */
export function noteSshConnectErrorForLastFailure(
  targetId: string,
  error: unknown,
  state: Pick<SshConnectionState, 'managedServer'> | undefined
): void {
  if (lastFailures.has(targetId)) {
    return
  }
  const failure = summarizeSshConnectionFailure({
    status: 'error',
    error: error instanceof Error ? error.message : String(error),
    ...(state?.managedServer ? { managedServer: state.managedServer } : {})
  })
  if (failure) {
    lastFailures.set(targetId, failure)
  }
}

export function getLastSshConnectFailure(targetId: string): SshConnectionFailure | undefined {
  return lastFailures.get(targetId)
}

export function forgetLastSshConnectFailure(targetId: string): void {
  lastFailures.delete(targetId)
}
