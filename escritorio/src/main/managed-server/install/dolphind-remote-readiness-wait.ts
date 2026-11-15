// Wait on-host in one bounded exec; repeated SSH polling spawned process bursts and triggered Windows EDR.
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'
import {
  DOLPHIND_PID_FILENAME,
  DOLPHIND_PID_MACHINE_FILENAME,
  DOLPHIND_READINESS_FILENAME,
  DOLPHIND_READINESS_MAX_BYTES,
  DOLPHIND_LAUNCH_MACHINE_COMMAND,
  POSIX_NO_SUCH_PROCESS_CASE
} from './dolphind-remote-host-support'
import {
  parseDolphindReadinessOutput,
  readDolphindReadinessCommand,
  type DolphindReadinessParse
} from './dolphind-remote-launch'
import {
  dolphindWindowsSlotOpCommand,
  readDolphindWindowsEncodedAnswer
} from './dolphind-remote-windows-node'
import { DOLPHIND_WINDOWS_READINESS_MARKER } from '../host-state/dolphind-windows-host-script'

// Stay below the 30-second exec timeout so waits can answer before channel expiry.
export const DOLPHIND_READINESS_WAIT_MAX_SECONDS = 20

const DOLPHIND_LAUNCH_EXITED_MARKER = 'DOLPHIND_LAUNCH_EXITED'

function posixReadinessWaitCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string,
  waitSeconds: number
): string {
  const file = quotePosixShell(joinRemotePath(host, remoteInstallDir, DOLPHIND_READINESS_FILENAME))
  const read = `head -c ${DOLPHIND_READINESS_MAX_BYTES + 1} ${file} 2>/dev/null`
  const pidFile = quotePosixShell(joinRemotePath(host, remoteInstallDir, DOLPHIND_PID_FILENAME))
  const pidMachine = quotePosixShell(
    joinRemotePath(host, remoteInstallDir, DOLPHIND_PID_MACHINE_FILENAME)
  )
  return [
    // Fail early only on proven exit from the launching machine; shared homes and unverified PIDs must keep waiting.
    `dolphind_launch_here() { dolphind_recorded=$(cat ${pidMachine} 2>/dev/null) && [ -n "$dolphind_recorded" ] && [ "$dolphind_recorded" = "$(${DOLPHIND_LAUNCH_MACHINE_COMMAND} 2>/dev/null)" ]; };`,
    `dolphind_launch_exited() { dolphind_launch_here || return 1; pid=$(cat ${pidFile} 2>/dev/null); case "$pid" in "" | *[!0-9]*) return 1;; esac;`,
    `probe_error=$(LC_ALL=C kill -0 "$pid" 2>&1) || { case "$probe_error" in ${POSIX_NO_SUCH_PROCESS_CASE}) return 0;; esac; return 1; };`,
    'case "$(ps -o stat= -p "$pid" 2>/dev/null)" in Z*) return 0;; esac; return 1; };',
    // Probe fractional sleep once; POSIX hosts may support only integer seconds.
    'if sleep 0.25 2>/dev/null; then dolphind_readiness_wait_step=0.25;',
    'else dolphind_readiness_wait_step=1; fi;',
    // Bound elapsed time, not iterations: slow filesystem reads otherwise overrun the client exec deadline.
    `dolphind_readiness_wait_end=$(($(date +%s) + ${waitSeconds}));`,
    'while [ "$(date +%s)" -lt "$dolphind_readiness_wait_end" ]; do',
    `[ "$(${read} | wc -l)" -gt 0 ] && break;`,
    `[ "$(${read} | wc -c)" -gt ${DOLPHIND_READINESS_MAX_BYTES} ] && break;`,
    `dolphind_launch_exited && { echo ${DOLPHIND_LAUNCH_EXITED_MARKER}; break; };`,
    'sleep "$dolphind_readiness_wait_step"; done;',
    `${read} || true`
  ].join(' ')
}

export function dolphindReadinessWaitCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string,
  waitSeconds: number
): string {
  const seconds = Math.max(0, Math.min(DOLPHIND_READINESS_WAIT_MAX_SECONDS, Math.ceil(waitSeconds)))
  if (!isWindowsRemoteHost(host)) {
    return posixReadinessWaitCommand(host, remoteInstallDir, seconds)
  }
  return dolphindWindowsSlotOpCommand(host, remoteInstallDir, 'readiness-wait', [
    joinRemotePath(host, remoteInstallDir, DOLPHIND_READINESS_FILENAME),
    String(DOLPHIND_READINESS_MAX_BYTES),
    String(seconds)
  ])
}

export function parseDolphindReadinessWaitOutput(
  host: RemoteHostPlatform,
  output: string
): DolphindReadinessParse {
  return parseDolphindReadinessOutput(
    isWindowsRemoteHost(host)
      ? (readDolphindWindowsEncodedAnswer(output, DOLPHIND_WINDOWS_READINESS_MARKER) ?? '')
      : withoutLaunchExitedMarker(output)
  )
}

export function dolphindLaunchExitedDuringWait(host: RemoteHostPlatform, output: string): boolean {
  return !isWindowsRemoteHost(host) && output.startsWith(`${DOLPHIND_LAUNCH_EXITED_MARKER}\n`)
}

function withoutLaunchExitedMarker(output: string): string {
  return output.startsWith(`${DOLPHIND_LAUNCH_EXITED_MARKER}\n`)
    ? output.slice(DOLPHIND_LAUNCH_EXITED_MARKER.length + 1)
    : output
}

export function readDolphindReadinessNowCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string
): string {
  // Windows host wait with zero delay substitutes for the unavailable head command.
  return isWindowsRemoteHost(host)
    ? dolphindReadinessWaitCommand(host, remoteInstallDir, 0)
    : readDolphindReadinessCommand(host, remoteInstallDir)
}
