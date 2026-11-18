import type { NodeDistMirrorAttempt } from '../../../shared/node-dist-mirror'
import type { SshManagedServerStatus } from '../../../shared/ssh-types'
import type { HostServerOnConnectResult } from './ssh-host-server-on-connect'
import {
  sshHostServerSetupRemedy,
  type SshHostServerSetupRemedy
} from '../../../shared/ssh-host-server-setup-remedy'

type UnservedDecision = Extract<HostServerOnConnectResult, { route: 'unserved' }>

// Keep shipped kind:relay wire compatibility even though it now means unserved.
export function unservedServerStatus(
  decision: UnservedDecision
): Extract<SshManagedServerStatus, { kind: 'relay' }> {
  return {
    kind: 'relay',
    reason: decision.reason,
    ...(decision.detail ? { detail: decision.detail } : {}),
    ...(decision.code ? { code: decision.code } : {}),
    ...(decision.terminals !== undefined ? { terminals: decision.terminals } : {}),
    ...(decision.terminalsElsewhere ? { terminalsElsewhere: true } : {}),
    ...(decision.canLeaveBehind ? { canLeaveBehind: true } : {}),
    ...(decision.held ? { held: true } : {}),
    ...(decision.contactLost ? { contactLost: true } : {}),
    ...(decision.nodeDownloadBlocked ? { nodeDownloadBlocked: decision.nodeDownloadBlocked } : {}),
    ...(decision.bridged ? { bridged: true } : {})
  }
}

const HELD_MOVE_MESSAGE =
  'Dolphin paused moving this host’s projects to its Dolphin server because it couldn’t confirm the server’s copy. Nothing is lost: the host keeps its projects and stays locked until the move finishes. Connect again to resume. If the server can’t come back, stop or forget it in Settings > Dolphin on your SSH hosts.'

// Each known reason names its remedy; an unknown one says to update and where the cause is.
const UNAVAILABLE_MESSAGES: Record<string, string> = {
  runtime_noexec:
    'This host doesn’t allow running programs from ~/.dolphin-remote, so Dolphin can’t start its server there. This usually means the home folder is mounted with noexec. Ask the host’s administrator to allow running programs there, then connect again.',
  windows_build_unsupported:
    'This host runs a version of Windows older than Windows 10 and Windows Server 2016, so it can’t run Dolphin’s server. Use a host with a newer version of Windows, or a Linux or macOS host.',
  windows_no_extractor:
    'This Windows host has neither tar.exe nor PowerShell’s Expand-Archive, so Dolphin can’t unpack its server there. Install Windows PowerShell 5.1 on the host, then connect again.',
  libc_unidentified:
    'Dolphin couldn’t tell which system C library this host uses (glibc or musl), so it can’t pick a server build for it. Check that `ldd --version` runs on the host, then connect again.',
  runtime_self_test:
    'The Node.js runtime Dolphin installed on this host failed its self-test. Check that the host has free disk space and allows running programs from ~/.dolphin-remote, then connect again.',
  security_software:
    'Security software on this host changed the files of Dolphin’s server runtime. Allow ~/.dolphin-remote in that software, then connect again.',
  native_preflight:
    'This host is missing system libraries Dolphin’s server needs. The server runs on Linux with glibc 2.28 or newer (Ubuntu 20.04 or later, Debian 10 or later) and on macOS. Update the host’s system, then connect again.',
  ssh_tunnel_unavailable:
    'This host’s SSH server doesn’t allow port forwarding, and Dolphin couldn’t reach its server through the SSH session either. Set AllowTcpForwarding yes in the host’s /etc/ssh/sshd_config, restart sshd, then connect again.'
}

const UNAVAILABLE_UNKNOWN_MESSAGE =
  'Dolphin can’t run its server on this host. Update Dolphin on this computer, then connect again; the cause is in this host’s Details, in Settings > SSH Hosts.'

/**
 * Esta copia salió sin el servidor para el sistema del host.
 *
 * Why un mensaje propio y no el de «no está soportado»: ese mandaba a instalar una versión vieja
 * de Dolphin, y acá no hay ninguna versión vieja que sirva — el servidor se compila en una máquina
 * del sistema de destino (`build-dolphind-prebuilds.mjs` arma sólo la ranura de la máquina donde
 * corre) y viaja adentro del instalador. Un instalador de Windows no puede traer la ranura de
 * Linux si nadie la compiló en Linux y la juntó antes de empaquetar. Decir eso es lo único que le
 * permite a alguien entender por qué su host no anda y qué falta para que ande.
 */
const SIN_SERVIDOR_PARA_EL_HOST =
  'This copy of Dolphin ships without the server for this host’s system, so it has nothing to install there. That server is compiled on a machine of the host’s own system and travels inside the installer, so a build that never carried it cannot reach this host. Update Dolphin on this computer to a version that includes it, then connect again.'

const CONTACT_LOST_MESSAGE =
  'Dolphin lost contact with this host while setting up its server. Nothing on the host was stopped. Connect again to continue.'

const NODE_DOWNLOAD_BLOCKED_MESSAGES: Record<NodeDistMirrorAttempt, string> = {
  unset:
    'Neither this computer nor this host could download Node.js, which Dolphin’s server needs. Set a Node.js download mirror in Settings > Advanced > Network, or check the network on both machines, then connect again.',
  tried:
    'Neither this computer nor this host could download Node.js, including from the Node.js download mirror. Check the mirror in Settings > Advanced > Network, then connect again.',
  unsupported:
    'Neither this computer nor this host could download Node.js, which Dolphin’s server needs. Check the network or proxy on both machines, then connect again.'
}

const SETUP_REMEDY_MESSAGES: Record<SshHostServerSetupRemedy, string> = {
  retry: 'Dolphin couldn’t start its server on this host. Try connecting again.',
  'free-host-space':
    'This host doesn’t have enough free disk space for Dolphin to keep a backup of its server data while starting it. Free up space on the host, then connect again.',
  'stop-unmanaged-runtime':
    'A Dolphin server this app didn’t start still appears to be using this host’s Dolphin data. Stop it on the host, then connect again. This host’s Details, in Settings > SSH Hosts, names its process.',
  'see-details':
    'Dolphin couldn’t start its server on this host. The cause is in this host’s Details, in Settings > SSH Hosts.'
}

/** Reuse untranslated status wording for logs/clients without the catalog. */
export function unservedHostServerMessage(decision: UnservedDecision): string {
  if (decision.held && (decision.reason === 'failed' || decision.reason === 'deferred')) {
    return HELD_MOVE_MESSAGE
  }
  switch (decision.reason) {
    case 'dolphind_unavailable':
      // Los dos motivos que significan «esta build no tiene qué instalarle», que es un hecho de
      // nuestro empaquetado y no algo que la persona pueda arreglar en el host.
      if (decision.detail === 'artifacts_unavailable' || decision.detail === 'unsupported_host') {
        return SIN_SERVIDOR_PARA_EL_HOST
      }
      return (
        (decision.detail && UNAVAILABLE_MESSAGES[decision.detail]) || UNAVAILABLE_UNKNOWN_MESSAGE
      )
    case 'relay_terminals_live':
    case 'relay_terminals_unverifiable':
      return 'Terminals started by an older version of Dolphin are still running on this host, and they don’t stop on their own. Close them in that version of Dolphin or end them on the host, then reconnect.'
    case 'refused':
      return decision.detail ?? 'Dolphin couldn’t set up its server on this host.'
    case 'source_changed':
      return 'This computer has projects or folders for this host that its Dolphin server doesn’t have yet, often added by an older version of Dolphin. Move them to this host’s Dolphin server in SSH Hosts settings to continue.'
    case 'deferred':
    case 'failed':
      if (decision.contactLost) {
        return CONTACT_LOST_MESSAGE
      }
      return decision.nodeDownloadBlocked
        ? NODE_DOWNLOAD_BLOCKED_MESSAGES[decision.nodeDownloadBlocked.mirror]
        : SETUP_REMEDY_MESSAGES[sshHostServerSetupRemedy(decision.code)]
  }
}
