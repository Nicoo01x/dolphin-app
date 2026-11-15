/** macOS pins Local Network attribution at spawn: SSH-launched terminals can lose LAN access after sshd-session exits (#25934; Apple TN3179). Record the nearest session plus start time and matching slot PID; preserve earlier attribution while a live terminal daemon survives dolphind restarts. */
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import { DOLPHIND_PID_FILENAME } from './dolphind-remote-host-support'

export const DOLPHIND_LAUNCH_SSH_SESSION_FILENAME = '.dolphind-launch-ssh-session'

const LOCAL_NETWORK_PRIVACY_MAJOR = 15
// Bounds the ancestor walk; real chains are a few processes deep.
const MAX_ANCESTOR_DEPTH = 32

export function recordsDolphindLaunchSshSession(host: RemoteHostPlatform): boolean {
  return host.os === 'darwin'
}

/** Choose the nearest sshd ancestor, which exits with this session; a listener farther up would remain alive. */
export function dolphindSshSessionAncestorShellFunction(): string {
  return (
    'dolphind_ssh_session() { dolphind_sp=$1; dolphind_si=0; ' +
    `while [ "$dolphind_si" -lt ${MAX_ANCESTOR_DEPTH} ]; do ` +
    'case "$dolphind_sp" in "" | *[!0-9]* | 0 | 1) return 1;; esac; ' +
    'dolphind_sc=$(ps -o comm= -p "$dolphind_sp" 2>/dev/null) || return 1; ' +
    'case "${dolphind_sc##*/}" in sshd*) ' +
    'dolphind_ss=$(ps -o lstart= -p "$dolphind_sp" 2>/dev/null) || return 1; ' +
    // Why unquoted: normalizes lstart's padding so a later read compares equal.
    'echo "$dolphind_sp" $dolphind_ss; return 0;; esac; ' +
    'dolphind_sp=$(ps -o ppid= -p "$dolphind_sp" 2>/dev/null | tr -d " "); ' +
    'dolphind_si=$((dolphind_si + 1)); done; return 1; };'
  )
}

/** Capture before detach without failing launch. */
export function captureDolphindLaunchSshSessionCommand(): string {
  return (
    `${dolphindSshSessionAncestorShellFunction()} ` +
    'dolphind_session=$(dolphind_ssh_session "$$" 2>/dev/null) || dolphind_session=;'
  )
}

function recordPath(host: RemoteHostPlatform, userDataDir: string): string {
  return quotePosixShell(joinRemotePath(host, userDataDir, DOLPHIND_LAUNCH_SSH_SESSION_FILENAME))
}

/** Return 0 for this root's live daemon, 1 for absence, 2 for unreadable argv; PID files alone may name recycled processes. */
function liveDaemonShellFunction(host: RemoteHostPlatform, userDataDir: string): string {
  const daemonDir = quotePosixShell(joinRemotePath(host, userDataDir, 'daemon'))
  return (
    `dolphind_daemon_live() { dolphind_ddir=${daemonDir}; for dolphind_df in "$dolphind_ddir"/daemon-v*.pid; do ` +
    '[ -f "$dolphind_df" ] || continue; ' +
    'dolphind_dp=$(sed -n \'s/.*"pid":\\([0-9][0-9]*\\).*/\\1/p\' "$dolphind_df" | head -n 1); ' +
    '[ -n "$dolphind_dp" ] || continue; ' +
    'kill -0 "$dolphind_dp" 2>/dev/null || continue; ' +
    'dolphind_da=$(ps -o args= -p "$dolphind_dp" 2>/dev/null); [ -n "$dolphind_da" ] || return 2; ' +
    'case "$dolphind_da" in *daemon-entry*"$dolphind_ddir"* | *"$dolphind_ddir"*daemon-entry*) return 0;; esac; ' +
    'done; return 1; };'
  )
}

/** After recording $!, preserve the live daemon's earlier session; otherwise record this launch's session. */
export function writeDolphindLaunchSshSessionCommand(
  host: RemoteHostPlatform,
  userDataDir: string
): string {
  const file = recordPath(host, userDataDir)
  return (
    // First-deploy detach may run before dolphind creates its data root.
    `{ dolphind_bg=$!; ( umask 077; mkdir -p ${quotePosixShell(userDataDir)} ); ` +
    `${liveDaemonShellFunction(host, userDataDir)} ` +
    'dolphind_daemon_live; dolphind_dl=$?; ' +
    'if [ "$dolphind_dl" = 0 ]; then ' +
    `dolphind_prev=$(cat ${file}); rm -f ${file}; set -- $dolphind_prev; ` +
    `[ "$#" -lt 3 ] || { shift; ( umask 077; echo "$dolphind_bg" "$@" > ${file} ); }; ` +
    // Unreadable daemon identity leaves attribution unknown, never assigned to this launch.
    `elif [ "$dolphind_dl" = 2 ]; then rm -f ${file}; ` +
    `else rm -f ${file}; [ -z "$dolphind_session" ] || ` +
    `( umask 077; echo "$dolphind_bg" $dolphind_session > ${file} ); fi; :; } 2>/dev/null`
  )
}

export function dolphindLaunchSshSessionProbeCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string,
  userDataDir: string
): string {
  const file = recordPath(host, userDataDir)
  const pidFile = quotePosixShell(joinRemotePath(host, remoteInstallDir, DOLPHIND_PID_FILENAME))
  return [
    'dolphind_mac=$(sw_vers -productVersion 2>/dev/null) || { echo NOT_APPLICABLE; exit 0; };',
    'dolphind_major=${dolphind_mac%%.*};',
    'case "$dolphind_major" in "" | *[!0-9]*) echo UNVERIFIABLE; exit 0;; esac;',
    `[ "$dolphind_major" -ge ${LOCAL_NETWORK_PRIVACY_MAJOR} ] || { echo NOT_APPLICABLE; exit 0; };`,
    `dolphind_rec=$(cat ${file} 2>/dev/null) || { echo NOT_RECORDED; exit 0; };`,
    `dolphind_pid=$(cat ${pidFile} 2>/dev/null);`,
    'set -- $dolphind_rec;',
    'case "$1:$2" in *[!0-9:]* | :* | *:) echo NOT_RECORDED; exit 0;; esac;',
    '[ "$1" = "$dolphind_pid" ] || { echo NOT_RECORDED; exit 0; };',
    'dolphind_sshd=$2; shift 2; dolphind_want=$*;',
    // A ps that can't list this shell can't prove another process absent.
    'ps -o pid= -p "$$" >/dev/null 2>&1 || { echo UNVERIFIABLE; exit 0; };',
    'dolphind_now=$(ps -o lstart= -p "$dolphind_sshd" 2>/dev/null); dolphind_now=$(echo $dolphind_now);',
    // A reused PID with another start time is a different process: the session is gone.
    'if [ -z "$dolphind_now" ] || [ "$dolphind_now" != "$dolphind_want" ]; then echo EXITED; else echo LIVE; fi'
  ].join(' ')
}

/** `not-recorded` covers older launches and clients: the condition is unknown, never assumed. */
export type DolphindLaunchSshSession =
  | 'live'
  | 'exited'
  | 'unverifiable'
  | 'not-recorded'
  | 'not-applicable'

export function parseDolphindLaunchSshSession(output: string): DolphindLaunchSshSession {
  switch (output.trim().split('\n').pop()?.trim() ?? '') {
    case 'LIVE':
      return 'live'
    case 'EXITED':
      return 'exited'
    case 'NOT_RECORDED':
      return 'not-recorded'
    case 'NOT_APPLICABLE':
      return 'not-applicable'
    default:
      return 'unverifiable'
  }
}
