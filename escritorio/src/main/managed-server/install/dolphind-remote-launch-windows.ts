// Win32-OpenSSH kills session jobs; require native breakaway without WMI/PowerShell, then record PID plus creation time.
import {
  DOLPHIND_WINDOWS_BREAKAWAY_CONTRACT,
  parseWindowsBreakawayLaunchReport,
  WINDOWS_BREAKAWAY_ENV_FLAG,
  WINDOWS_BREAKAWAY_LAUNCH_FLAG,
  WINDOWS_BREAKAWAY_PROCESS_FILE_FLAG,
  WINDOWS_BREAKAWAY_STDERR_FLAG,
  WINDOWS_BREAKAWAY_STDERR_KEEP_PREVIOUS_FLAG,
  WINDOWS_BREAKAWAY_STDOUT_FLAG
} from '../../../shared/windows-breakaway-launch'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import {
  dolphindWindowsNodeCommandLine,
  dolphindWindowsSlotOpCommand,
  readDolphindWindowsEncodedAnswer
} from './dolphind-remote-windows-node'
import {
  DOLPHIND_WINDOWS_ENTRY_MARKER,
  DOLPHIND_WINDOWS_RUNTIME_MARKER
} from '../host-state/dolphind-windows-host-script'
import {
  DOLPHIND_LOG_FILENAME,
  DOLPHIND_READINESS_FILENAME,
  DOLPHIND_WINDOWS_PROCESS_FILENAME
} from './dolphind-remote-host-support'
import { dolphindManagedLaunchEnv, type DolphindLaunchSpec } from './dolphind-remote-launch'
import { DOLPHIND_WINDOWS_LAUNCH_REFUSED_CODE } from '../../dolphind/dolphind-host-unavailable'

export class DolphindWindowsLaunchRefusedError extends Error {
  readonly code = DOLPHIND_WINDOWS_LAUNCH_REFUSED_CODE
  constructor(reason: string) {
    super(
      `The Windows host refused to start dolphind outside the SSH session (${reason}). dolphind needs ` +
        'a job that allows breakaway and a slot with the process-tree launcher; it never falls ' +
        'back to WMI.'
    )
    this.name = 'DolphindWindowsLaunchRefusedError'
  }
}

/** The launcher reported that it could not start dolphind. */
export class DolphindWindowsLaunchFailedError extends Error {
  constructor(detail: string) {
    super(`dolphind's Windows launcher did not start the candidate: ${detail}.`)
    this.name = 'DolphindWindowsLaunchFailedError'
  }
}

/** Resolve pinned slot runtime and remove stale instance-stop intent before launch. */
export function windowsDolphindLaunchRuntimeCommand(
  host: RemoteHostPlatform,
  slotDir: string
): string {
  return dolphindWindowsSlotOpCommand(host, slotDir, 'slot-runtime', [
    slotDir,
    'clear-stop-request'
  ])
}

export function readWindowsDolphindSlotRuntime(output: string): string {
  const runtime = readDolphindWindowsEncodedAnswer(output, DOLPHIND_WINDOWS_RUNTIME_MARKER)
  if (!runtime) {
    throw new Error('The Windows host did not name the runtime this dolphind slot needs.')
  }
  return runtime
}

/** Older host scripts omit entry, implying the legacy single-file launcher. */
export function readWindowsDolphindSlotEntry(
  output: string,
  host: RemoteHostPlatform,
  slotDir: string
): string {
  return (
    readDolphindWindowsEncodedAnswer(output, DOLPHIND_WINDOWS_ENTRY_MARKER) ??
    joinRemotePath(host, slotDir, 'dolphind.js')
  )
}

export function windowsDolphindLaunchCommand(
  host: RemoteHostPlatform,
  spec: DolphindLaunchSpec,
  slotRuntime: string,
  slotEntry = joinRemotePath(host, spec.remoteInstallDir, 'dolphind.js')
): string {
  const dir = spec.remoteInstallDir
  return dolphindWindowsNodeCommandLine(slotRuntime, [
    slotEntry,
    WINDOWS_BREAKAWAY_LAUNCH_FLAG,
    // CREATE_ALWAYS removes stale readiness before the launcher returns.
    WINDOWS_BREAKAWAY_STDOUT_FLAG,
    joinRemotePath(host, dir, DOLPHIND_READINESS_FILENAME),
    WINDOWS_BREAKAWAY_STDERR_FLAG,
    joinRemotePath(host, dir, DOLPHIND_LOG_FILENAME),
    // Preserve previous stderr for crash diagnosis across restart.
    WINDOWS_BREAKAWAY_STDERR_KEEP_PREVIOUS_FLAG,
    WINDOWS_BREAKAWAY_PROCESS_FILE_FLAG,
    joinRemotePath(host, dir, DOLPHIND_WINDOWS_PROCESS_FILENAME),
    WINDOWS_BREAKAWAY_ENV_FLAG,
    `DOLPHIN_VERSION=${spec.fullVersion}`,
    WINDOWS_BREAKAWAY_ENV_FLAG,
    `DOLPHIN_USER_DATA=${spec.userDataDir}`,
    ...dolphindManagedLaunchEnv(spec).flatMap(([name, value]) => [
      WINDOWS_BREAKAWAY_ENV_FLAG,
      `${name}=${value}`
    ]),
    DOLPHIND_WINDOWS_BREAKAWAY_CONTRACT.argsFlag,
    '--json',
    '--bind',
    spec.bindHost,
    '--port',
    String(spec.port)
  ])
}

export function hasWindowsDolphindLaunchReport(output: string): boolean {
  return parseWindowsBreakawayLaunchReport(DOLPHIND_WINDOWS_BREAKAWAY_CONTRACT, output) !== null
}

/** Return launched PID or surface native-breakaway refusal/failure. */
export function readWindowsDolphindLaunchReport(output: string): number {
  const report = parseWindowsBreakawayLaunchReport(DOLPHIND_WINDOWS_BREAKAWAY_CONTRACT, output)
  if (report?.method === 'breakaway') {
    return report.pid
  }
  if (report?.method === 'unavailable') {
    throw new DolphindWindowsLaunchRefusedError(
      report.step ? `${report.reason} at ${report.step}` : report.reason
    )
  }
  if (report?.method === 'failed') {
    throw new DolphindWindowsLaunchFailedError(
      `${report.reason}${report.step ? ` at ${report.step}` : ''} (code ${String(report.code ?? 0)})`
    )
  }
  throw new Error("dolphind's Windows launcher did not start the candidate: no launch report.")
}
