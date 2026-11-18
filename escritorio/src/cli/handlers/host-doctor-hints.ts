/** What `dolphin host doctor` knows about the host it checks; all of it is the user's own config. */
export type HostDoctorTarget = {
  id: string
  label: string
  /** `user@address:port`, or the ~/.ssh/config alias the host was imported from. */
  endpoint: string
  address: string
  user: string
  port: number
  configHost?: string
  identityFile?: string
}

const SAFE_SHELL_WORD = /^[A-Za-z0-9._@:/~+-]+$/

function shellWord(value: string): string {
  return SAFE_SHELL_WORD.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`
}

/** The ssh arguments that reach this host from a terminal on this computer. */
export function sshDestination(target: HostDoctorTarget): string {
  if (target.configHost) {
    return shellWord(target.configHost)
  }
  const destination = target.user ? `${target.user}@${target.address}` : target.address
  const port = target.port === 22 ? '' : `-p ${target.port} `
  const identity = target.identityFile ? `-i ${shellWord(target.identityFile)} ` : ''
  return `${port}${identity}${shellWord(destination)}`
}

function knownHostsEntry(target: HostDoctorTarget): string {
  return shellWord(target.port === 22 ? target.address : `[${target.address}]:${target.port}`)
}

function hintsForReason(target: HostDoctorTarget, reason: string): string[] {
  const ssh = sshDestination(target)
  const probe = `Run \`ssh -o BatchMode=yes -o ConnectTimeout=10 ${ssh} true\` on this computer: it shows SSH's own error without asking for anything.`
  switch (reason) {
    case 'auth':
      return [
        probe,
        `If no key is accepted, install one from this computer with \`ssh-copy-id ${ssh}\` (the person types the password once), or check the user name.`
      ]
    case 'passphrase':
      return [
        'The key is encrypted: load it into ssh-agent (`ssh-add <key>`) and let the person type the passphrase; never ask for it in the chat.'
      ]
    case 'host-key':
      return [
        `If the host was reinstalled, remove the old key with \`ssh-keygen -R ${knownHostsEntry(target)}\`, then confirm the new fingerprint with the person before connecting.`
      ]
    case 'refused':
    case 'timeout':
    case 'unreachable':
      return [
        probe,
        `Check that port ${target.port} is open: the provider's firewall (on Hostinger, VPS > Firewall) and \`ufw status\` on the host must allow it, and sshd must be running.`
      ]
    case 'host-name':
      return ['Check the address for typos; an IP address avoids DNS altogether.']
    case 'server:unavailable:artifacts_unavailable':
    case 'server:unavailable:unsupported_host':
      return [
        "This Dolphin build does not carry the server for the host's system. Update Dolphin on this computer; until then the host can't run Dolphin's server."
      ]
    case 'server:node-download-blocked':
      return [
        'Set a Node.js download mirror in Settings > Advanced > Network, or fix the network or proxy on both machines.'
      ]
    case 'server:setup-free-host-space':
      return [`Free disk space on the host: \`ssh ${ssh} df -h ~\` shows how much is left.`]
    case 'server:unavailable:runtime_noexec':
      return [
        `Check how the home folder is mounted: \`ssh ${ssh} "findmnt -T ~"\`; a noexec mount must be changed on the host.`
      ]
    default:
      return reason.startsWith('server:')
        ? [`Look at the host: \`ssh ${ssh} "uname -a; ldd --version | head -1; df -h ~"\`.`]
        : [probe]
  }
}

export function hostDoctorHints(
  target: HostDoctorTarget,
  reason: string | undefined,
  ok: boolean
): string[] {
  if (ok) {
    return []
  }
  return [
    ...(reason ? hintsForReason(target, reason) : []),
    'For every reason and its fix, load `dolphin skills get dolphin-vps`.',
    `When it is fixed, run \`dolphin host doctor ${target.id}\` again until it reports OK.`
  ]
}
