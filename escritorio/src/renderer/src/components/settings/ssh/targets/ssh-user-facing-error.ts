import { translate } from '@/i18n/i18n'
import {
  classifySshConnectFailureText,
  SSH_CONNECT_FAILURE_NEXT_STEPS,
  type SshConnectFailureKind
} from '../../../../../../shared/ssh-connect-failure-kind'

const ELECTRON_IPC_PREFIX = /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i

const KNOWN_SSH_ERRORS: { test: RegExp; key: string; fallback: string }[] = [
  {
    test: /connection lost before handshake/i,
    key: 'settings.ssh.errors.handshakeLost',
    fallback: 'Connection lost before handshake'
  },
  {
    test: /encrypted private (?:OpenSSH )?key detected, but no passphrase given/i,
    key: 'settings.ssh.errors.passphraseRequired',
    fallback:
      'Cannot parse privateKey: Encrypted private OpenSSH key detected, but no passphrase given'
  },
  {
    test: /cannot parse privateKey:.*bad passphrase/i,
    key: 'settings.ssh.errors.badPassphrase',
    fallback: 'Cannot parse privateKey: OpenSSH key integrity check failed -- bad passphrase?'
  },
  {
    test: /all configured authentication methods failed/i,
    key: 'settings.ssh.errors.authMethodsFailed',
    fallback: 'All configured authentication methods failed'
  },
  {
    test: /timed out while waiting for handshake/i,
    key: 'settings.ssh.errors.handshakeTimeout',
    fallback: 'Timed out while waiting for handshake'
  },
  {
    test: /host key verification failed/i,
    key: 'settings.ssh.errors.hostKeyVerificationFailed',
    fallback: 'Host key verification failed'
  },
  {
    test: /permission denied \(publickey\)/i,
    key: 'settings.ssh.errors.permissionDeniedPublickey',
    fallback: 'Permission denied (publickey)'
  },
  {
    test: /permission denied/i,
    key: 'settings.ssh.errors.permissionDenied',
    fallback: 'Permission denied'
  },
  {
    test: /getaddrinfo ENOTFOUND/i,
    key: 'settings.ssh.errors.hostNotFound',
    fallback: 'Host not found'
  },
  {
    test: /connect ECONNREFUSED/i,
    key: 'settings.ssh.errors.connectionRefused',
    fallback: 'Connection refused'
  },
  {
    test: /connect ETIMEDOUT|connect EHOSTUNREACH/i,
    key: 'settings.ssh.errors.connectionTimedOut',
    fallback: 'Connection timed out'
  }
]

export function stripElectronIpcErrorPrefix(raw: string): string {
  return raw.replace(ELECTRON_IPC_PREFIX, '').trim()
}

export function formatSshUserFacingError(raw: string | null | undefined): string {
  if (!raw?.trim()) {
    return translate('auto.components.settings.SshPane.e95d5ae10e', 'Connection failed')
  }
  const message = stripElectronIpcErrorPrefix(raw)
  for (const known of KNOWN_SSH_ERRORS) {
    if (known.test.test(message)) {
      return translate(known.key, known.fallback)
    }
  }
  return message
}

export function formatSshErrorOrFallback(error: unknown, fallback: string): string {
  return error instanceof Error ? formatSshUserFacingError(error.message) : fallback
}

const NEXT_STEP_KEYS: Record<SshConnectFailureKind, string> = {
  'host-key': 'settings.ssh.nextStep.hostKey',
  auth: 'settings.ssh.nextStep.auth',
  passphrase: 'settings.ssh.nextStep.passphrase',
  refused: 'settings.ssh.nextStep.refused',
  'host-name': 'settings.ssh.nextStep.hostName',
  unreachable: 'settings.ssh.nextStep.unreachable',
  timeout: 'settings.ssh.nextStep.timeout'
}

/** The translated next step for a failure kind main or the CLI named. */
export function sshConnectFailureNextStepText(kind: SshConnectFailureKind): string {
  return translate(NEXT_STEP_KEYS[kind], SSH_CONNECT_FAILURE_NEXT_STEPS[kind])
}

/**
 * A failed connect or test as the person should read it: what to do first, then SSH's reason.
 *
 * Main already leads a session failure with an English next step (`<step> (<raw>)`); that
 * step is swapped for its translation instead of being shown twice, and a raw error gets one.
 */
export function formatSshFailureWithNextStep(raw: string | null | undefined): string {
  const message = stripElectronIpcErrorPrefix(raw ?? '')
  const kind = message ? classifySshConnectFailureText(message) : null
  if (!kind) {
    return formatSshUserFacingError(message)
  }
  const englishStep = SSH_CONNECT_FAILURE_NEXT_STEPS[kind]
  const rawReason = message.startsWith(englishStep)
    ? message
        .slice(englishStep.length)
        .trim()
        .replace(/^\((.*)\)$/s, '$1')
    : message
  const reason = rawReason ? formatSshUserFacingError(rawReason) : ''
  return reason
    ? `${sshConnectFailureNextStepText(kind)} (${reason})`
    : sshConnectFailureNextStepText(kind)
}
