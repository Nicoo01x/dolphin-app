/**
 * What went wrong when an SSH connect failed, as a stable code, and what to do about it.
 *
 * Shared so the three places that explain a failure say the same thing: main (the error it
 * publishes), the renderer (which translates the next step), and the CLI that agents read
 * (`dolphin host doctor`). The next steps are static text: they never carry the host, the user or
 * SSH's raw words, so they can travel to a paired client the address is kept from.
 */

/**
 * Why a connect failed: a stable `reason` code (`auth`, `timeout`, `server:unavailable:…`) and
 * what to do about it. Never SSH's raw words, which can name the address and user, so it may
 * reach paired clients the address is kept from.
 */
export type SshConnectionFailure = {
  reason: string
  nextStep: string
}

export type SshConnectFailureKind =
  | 'host-key'
  | 'auth'
  | 'passphrase'
  | 'refused'
  | 'host-name'
  | 'unreachable'
  | 'timeout'

export const SSH_CONNECT_FAILURE_NEXT_STEPS: Readonly<Record<SshConnectFailureKind, string>> = {
  'host-key':
    'SSH couldn’t confirm this host’s identity. Run ssh to this host in a terminal to see why and trust or update its key, then connect again.',
  auth: 'The host didn’t accept any sign-in Dolphin offered. Check the user name and the key, ssh-agent or password for this host, then connect again.',
  passphrase: 'Dolphin couldn’t unlock the SSH key. Check its passphrase, then connect again.',
  refused:
    'Nothing accepted the SSH connection at this address. Check the host name and port, and that sshd is running on the host.',
  'host-name': 'The host name couldn’t be looked up. Check the name and your network connection.',
  unreachable:
    'There’s no network route to the host. Check your network or VPN, then connect again.',
  timeout:
    'The connection didn’t finish in time. Check that the host is reachable from this computer (network, VPN, firewall), then connect again.'
}

const KINDS = Object.keys(SSH_CONNECT_FAILURE_NEXT_STEPS) as SshConnectFailureKind[]

// Mirrors main's isPassphraseError / isAuthError, which also read ssh2's error level.
function isPassphraseText(text: string): boolean {
  return (
    text.includes('passphrase') || text.includes('encrypted key') || text.includes('bad decrypt')
  )
}

function isAuthText(text: string): boolean {
  return (
    text.includes('all configured authentication methods failed') ||
    text.includes('authentication failed') ||
    text.includes('too many authentication failures') ||
    /permission denied(?:, please try again\.?| \([^)]*(?:publickey|password|keyboard-interactive|gssapi|hostbased)[^)]*\))/.test(
      text
    )
  )
}

/** Network-level causes, read from the error code and SSH's own wording. */
export function classifySshNetworkFailure(text: string): SshConnectFailureKind | null {
  const lower = text.toLowerCase()
  if (/econnrefused|connection refused/.test(lower)) {
    return 'refused'
  }
  if (
    /enotfound|eai_again|could not resolve hostname|name or service not known|nodename nor servname/.test(
      lower
    )
  ) {
    return 'host-name'
  }
  if (/ehostunreach|enetunreach|no route to host|network is unreachable/.test(lower)) {
    return 'unreachable'
  }
  if (/etimedout|timed out/.test(lower)) {
    return 'timeout'
  }
  return null
}

/**
 * Classify a failure from its text alone: SSH's raw message, or one Dolphin already published
 * with the next step in front (`<next step> (<raw>)`), which is recognised by that prefix.
 */
export function classifySshConnectFailureText(text: string): SshConnectFailureKind | null {
  const published = KINDS.find((kind) => text.startsWith(SSH_CONNECT_FAILURE_NEXT_STEPS[kind]))
  if (published) {
    return published
  }
  const lower = text.toLowerCase()
  if (/cancel/.test(lower)) {
    return null
  }
  if (/host key verification failed/.test(lower)) {
    return 'host-key'
  }
  if (isPassphraseText(lower)) {
    return 'passphrase'
  }
  if (isAuthText(lower)) {
    return 'auth'
  }
  return classifySshNetworkFailure(lower)
}
