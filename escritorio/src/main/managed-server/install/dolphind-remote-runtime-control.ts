import { DOLPHIND_STARTUP_READINESS_TIMEOUT_MS } from '../../../shared/dolphind-profile-preflight'
import {
  dolphindLaunchCommand,
  parseDolphindReadinessOutput,
  type DolphindLaunchSpec,
  type DolphindReadinessParse
} from './dolphind-remote-launch'
import {
  hasWindowsDolphindLaunchReport,
  readWindowsDolphindLaunchReport,
  readWindowsDolphindSlotRuntime,
  readWindowsDolphindSlotEntry,
  windowsDolphindLaunchCommand,
  windowsDolphindLaunchRuntimeCommand
} from './dolphind-remote-launch-windows'
import {
  DOLPHIND_READINESS_WAIT_MAX_SECONDS,
  dolphindLaunchExitedDuringWait,
  dolphindReadinessWaitCommand,
  parseDolphindReadinessWaitOutput
} from './dolphind-remote-readiness-wait'
import type { DolphindHostTransport } from './dolphind-host-transport'
import { errorMessage } from '../../../shared/error-message'
import {
  execCommand,
  isSshCommandExitError,
  isUnconfirmedSshCommandTermination
} from '../../ssh/remote-exec/remote-exec-command'
import {
  currentDolphindFence,
  isDolphindFenceLost,
  DolphindFenceLostError,
  posixDolphindFenceGuard
} from '../activation/dolphind-activation-fence-scope'
import { dolphindWindowsHomeOpCommand } from './dolphind-remote-windows-node'
import { DOLPHIND_WINDOWS_FENCE_ARG } from '../host-state/dolphind-windows-host-fence-ops'
import {
  isWindowsRemoteHost,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'

// Pause even after early host answers to avoid a tight retry loop.
const READINESS_RETRY_PAUSE_MS = 1_000

export type DolphindRemoteExecTarget = {
  conn: DolphindHostTransport
  host: RemoteHostPlatform
  signal?: AbortSignal
  /** Locates the runtime store for host-record scripts; required on Windows, unused elsewhere. */
  remoteHome?: string
}

/** A held activation fence must still name this run before any host step. */
export async function execDolphindRemote(
  target: DolphindRemoteExecTarget,
  command: string,
  signal = target.signal
): Promise<string> {
  const fence = currentDolphindFence()
  const run = (line: string): Promise<string> =>
    execCommand(target.conn, line, {
      wrapCommand: target.host.commandDialect !== 'powershell',
      signal
    })
  try {
    if (!fence) {
      return await run(command)
    }
    if (!isWindowsRemoteHost(target.host)) {
      return await run(`${posixDolphindFenceGuard(fence)} ${command}`)
    }
    // Host ops check ownership internally; other commands need a preceding check.
    if (!command.includes(DOLPHIND_WINDOWS_FENCE_ARG) && target.remoteHome) {
      await run(dolphindWindowsHomeOpCommand(target.host, target.remoteHome, 'fence-check', []))
    }
    return await run(command)
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    throw isDolphindFenceLost(error) ? new DolphindFenceLostError() : error
  }
}

/** Only confirmed failures use fallback; unconfirmed failures and lost fences propagate. */
export function execDolphindRemoteOr(
  target: DolphindRemoteExecTarget,
  command: string,
  fallback = ''
): Promise<string> {
  return execDolphindRemote(target, command).catch((error: unknown) => {
    if (isUnconfirmedSshCommandTermination(error) || error instanceof DolphindFenceLostError) {
      throw error
    }
    return fallback
  })
}

/** Recovery paths must finish even when the request that started them was cancelled. */
export function withoutAbortSignal<T extends { signal?: AbortSignal }>(
  options: T
): Omit<T, 'signal'> {
  const { signal: _signal, ...rest } = options
  return rest
}

export async function launchDolphindAndAwaitReadiness(
  target: DolphindRemoteExecTarget & {
    readinessTimeoutMs?: number
    sleep?: (ms: number) => Promise<void>
  },
  spec: DolphindLaunchSpec
): Promise<DolphindReadinessParse> {
  if (isWindowsRemoteHost(target.host)) {
    const slotAnswer = await execDolphindRemote(
      target,
      windowsDolphindLaunchRuntimeCommand(target.host, spec.remoteInstallDir)
    )
    const slotRuntime = readWindowsDolphindSlotRuntime(slotAnswer)
    const slotEntry = readWindowsDolphindSlotEntry(slotAnswer, target.host, spec.remoteInstallDir)
    readWindowsDolphindLaunchReport(
      await windowsLaunchReportOutput(
        target,
        windowsDolphindLaunchCommand(target.host, spec, slotRuntime, slotEntry)
      )
    )
  } else {
    await execDolphindRemote(
      target,
      dolphindLaunchCommand(
        target.host,
        spec,
        target.conn.dolphindLaunchDetach ?? 'nohup',
        (await target.conn.dolphindLaunchEnv?.({ fullVersion: spec.fullVersion })) ?? []
      )
    )
  }
  const deadline = Date.now() + (target.readinessTimeoutMs ?? DOLPHIND_STARTUP_READINESS_TIMEOUT_MS)
  const sleep = target.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  let last = parseDolphindReadinessOutput('')
  let lastWaitError: unknown
  // Always read once, even if client scheduling outlasted the deadline.
  for (let first = true; first || Date.now() < deadline; first = false) {
    target.signal?.throwIfAborted()
    const waitSeconds = Math.min(
      DOLPHIND_READINESS_WAIT_MAX_SECONDS,
      Math.ceil((deadline - Date.now()) / 1000)
    )
    let output: string
    try {
      output = await execDolphindRemote(
        target,
        dolphindReadinessWaitCommand(target.host, spec.remoteInstallDir, waitSeconds)
      )
    } catch (error) {
      if (
        (error instanceof Error && error.name === 'AbortError') ||
        isUnconfirmedSshCommandTermination(error) ||
        error instanceof DolphindFenceLostError
      ) {
        throw error
      }
      // Failed reads do not prove launch failure; stopping here could kill a healthy candidate.
      lastWaitError = error
      console.warn(`[dolphind] readiness wait failed; retrying: ${errorMessage(error)}`)
      await sleep(READINESS_RETRY_PAUSE_MS)
      continue
    }
    target.signal?.throwIfAborted()
    lastWaitError = undefined
    last = parseDolphindReadinessWaitOutput(target.host, output)
    // An exited launch answers as the deadline would, so callers attach the same log tail.
    if (last.state !== 'pending' || dolphindLaunchExitedDuringWait(target.host, output)) {
      return last
    }
    await sleep(READINESS_RETRY_PAUSE_MS)
  }
  if (lastWaitError !== undefined) {
    throw lastWaitError
  }
  return last
}

/** The launcher writes its report before exiting nonzero, so a failed launch still names its cause. */
async function windowsLaunchReportOutput(
  target: DolphindRemoteExecTarget,
  command: string
): Promise<string> {
  try {
    return await execDolphindRemote(target, command)
  } catch (error) {
    // Without a report the command error carries the better diagnostic.
    if (isSshCommandExitError(error) && hasWindowsDolphindLaunchReport(error.stdout)) {
      return error.stdout
    }
    throw error
  }
}
