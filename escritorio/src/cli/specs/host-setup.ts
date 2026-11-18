import type { CommandSpec } from '../args'
import { LOCAL_COMMAND_FLAGS } from '../args'

const LOCAL_NOTE =
  'Acts on this machine’s own Dolphin runtime, the same SSH registry `dolphin host list` reads. --environment and --pairing-code are rejected rather than ignored.'
const SERVER_NOTE =
  'Connecting is what installs Dolphin’s server: on an empty host the first connect uploads it and starts it, exactly like Connect in the app. Later connects reuse or update it.'
const SECRETS_NOTE =
  'Never pass a password or passphrase: Dolphin asks for them in the app when it connects. Use an SSH key (--identity-file) or ssh-agent for hosts an agent sets up.'

export const HOST_SETUP_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['host', 'add'],
    summary: 'Save an SSH host (a VPS or any machine you reach over SSH) in this Dolphin',
    usage:
      'dolphin host add --address <host> --user <user> [--port <n>] [--identity-file <path>] [--label <name>] [--install-server] [--json]',
    allowedFlags: [
      ...LOCAL_COMMAND_FLAGS,
      'address',
      'user',
      'port',
      'identity-file',
      'label',
      'install-server'
    ],
    notes: [
      '--address is the host name or IP the machine answers SSH on. It is not `--host`, which every other command reads as a selector for where to run.',
      'Saving does not contact the host. Pass --install-server to connect right away, which installs Dolphin’s server on it; or run `dolphin host connect` later.',
      'A host already saved with the same address, user and port is returned as it is instead of being added twice.',
      SERVER_NOTE,
      SECRETS_NOTE,
      LOCAL_NOTE
    ],
    examples: [
      'dolphin host add --address 203.0.113.10 --user root --label my-vps --install-server',
      'dolphin host add --address vps.example.com --user deploy --port 2222 --identity-file ~/.ssh/id_ed25519 --json'
    ]
  },
  {
    path: ['host', 'connect'],
    summary: 'Connect a saved SSH host and set up Dolphin’s server on it',
    usage: 'dolphin host connect <id|label> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'target'],
    positionalArgs: ['target'],
    notes: [
      'Takes the id or the label `dolphin host list` prints for an SSH target.',
      'Waits for the connect to finish, which the first time includes uploading the server (a few minutes).',
      'When it fails it prints the reason and the next step; `dolphin host doctor` prints the full diagnosis.',
      SERVER_NOTE,
      LOCAL_NOTE
    ],
    examples: [
      'dolphin host connect my-vps',
      'dolphin host connect ssh-1783599077486-fyasux --json'
    ]
  },
  {
    path: ['host', 'doctor'],
    summary: 'Diagnose an SSH host: connect it if needed and say what is wrong and what to do',
    usage: 'dolphin host doctor <id|label> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'target'],
    positionalArgs: ['target'],
    notes: [
      'Reports whether the host connects, whether Dolphin’s server runs there, the reason for a failure as a stable code (auth, timeout, refused, host-key, server:unavailable:<cause>, …) and the next step.',
      'If the host is not connected it tries to connect it first, the same as `dolphin host connect`.',
      'Exits 1 while something still fails, so an agent can loop on it: fix the cause, run it again.',
      'The output never includes passwords, passphrases, keys or tokens; the next steps are fixed text.',
      'Load `dolphin skills get dolphin-vps` for the table of every reason and how to fix it on the host.',
      LOCAL_NOTE
    ],
    examples: ['dolphin host doctor my-vps', 'dolphin host doctor my-vps --json']
  }
]
