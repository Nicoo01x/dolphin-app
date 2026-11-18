import { isHostKeyVerificationError } from '../host-keys/ssh-host-key-decision'
import { isAuthError, isPassphraseError } from './reconnect/ssh-reconnect-error-classification'
import {
  classifySshNetworkFailure,
  SSH_CONNECT_FAILURE_NEXT_STEPS,
  type SshConnectFailureKind
} from '../../../shared/ssh-connect-failure-kind'

// SSH's own wording, raw or through system ssh, names the failure; match it, not exact codes alone.
function classify(error: Error): SshConnectFailureKind | null {
  // Dolphin's own host-key refusals already name their exact fix.
  if (isHostKeyVerificationError(error) || /cancel/i.test(error.message)) {
    return null
  }
  if (/host key verification failed/i.test(error.message)) {
    return 'host-key'
  }
  if (isPassphraseError(error)) {
    return 'passphrase'
  }
  if (isAuthError(error)) {
    return 'auth'
  }
  return classifySshNetworkFailure(`${'code' in error ? String(error.code) : ''} ${error.message}`)
}

/** SSH's reason, led by what to do about it when the failure is one users can act on. */
export function describeSshConnectFailure(error: Error): string {
  const kind = classify(error)
  return kind ? `${SSH_CONNECT_FAILURE_NEXT_STEPS[kind]} (${error.message})` : error.message
}
