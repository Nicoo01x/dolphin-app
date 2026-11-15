// Readiness and instance-lock records must agree before the slot's own build requests a stop.
import { randomUUID } from 'node:crypto'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { selectDolphindSlotRuntimeCommand } from '../install/dolphind-remote-runtime'
import {
  parseDolphindReadinessWaitOutput,
  readDolphindReadinessNowCommand
} from '../install/dolphind-remote-readiness-wait'
import { execDolphindRemote } from '../install/dolphind-remote-runtime-control'
import { readBoundedDolphindRemoteRecord } from '../install/dolphind-remote-record-file'
import { dolphindSlotDir, type DolphindSlotOptions } from '../activation/dolphind-recovery-slot'
import { isWindowsRemoteHost, joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import {
  dolphindWindowsNodeCommandLine,
  dolphindWindowsSlotOpCommand,
  readDolphindWindowsEncodedAnswer
} from '../install/dolphind-remote-windows-node'
import { DOLPHIND_WINDOWS_RUNTIME_MARKER } from '../host-state/dolphind-windows-host-script'
import {
  DOLPHIND_LOCK_FILE_NAME,
  parseDolphindInstanceLockRecord
} from '../../dolphind/dolphind-instance-lock'
import {
  DOLPHIND_CANCEL_MANAGED_STOP_FLAG,
  DOLPHIND_COMPLETE_MANAGED_STOP_FLAG,
  DOLPHIND_MANAGED_STOP_REQUEST_FILE_FLAG,
  DOLPHIND_STOP_REQUESTS_CAPABILITY,
  DolphindManagedStopCancellationSchema,
  DolphindManagedStopCompletionSchema,
  type DolphindManagedStopCancellation,
  type DolphindManagedStopCompletion,
  type DolphindManagedStopContext,
  type DolphindManagedStopRequest
} from '../../../shared/dolphind-stop-request'

const LOCK_RECORD_MAX_BYTES = 64 * 1024

export type DolphindManagedStopTarget =
  | { state: 'ready'; context: DolphindManagedStopContext }
  | { state: 'refused'; verdict: 'unverifiable'; code: string; reason: string }

function refused(code: string, reason: string): DolphindManagedStopTarget {
  return { state: 'refused', verdict: 'unverifiable', code, reason }
}

export async function readRemoteDolphindManagedStopTarget(
  options: DolphindSlotOptions,
  version: string
): Promise<DolphindManagedStopTarget> {
  const slotDir = dolphindSlotDir(options, version)
  const readiness = parseDolphindReadinessWaitOutput(
    options.host,
    await execDolphindRemote(options, readDolphindReadinessNowCommand(options.host, slotDir))
  )
  if (readiness.state !== 'ready' || !readiness.readiness.health) {
    return refused(
      'dolphind_managed_stop_readiness_unverifiable',
      `dolphind ${version} has no readable readiness record, so the running instance is unknown.`
    )
  }
  const { health, runtimeId } = readiness.readiness
  if (health.stopRequests !== DOLPHIND_STOP_REQUESTS_CAPABILITY) {
    return refused(
      'dolphind_managed_stop_unsupported',
      `dolphind ${version} predates managed stop requests; it can only be stopped by signal.`
    )
  }
  const lockPath = joinRemotePath(options.host, options.userDataDir, DOLPHIND_LOCK_FILE_NAME)
  const lockRead = await readBoundedDolphindRemoteRecord(options, lockPath, LOCK_RECORD_MAX_BYTES)
  const lock = lockRead.state === 'present' ? parseDolphindInstanceLockRecord(lockRead.raw) : null
  if (!lock || lock.pid !== health.pid || !runtimeId) {
    return refused(
      'dolphind_managed_stop_instance_unverifiable',
      `The instance lock does not name the dolphind ${version} that published readiness.`
    )
  }
  return {
    state: 'ready',
    context: {
      version,
      runtimeId,
      instance: {
        pid: lock.pid,
        startedAtMs: lock.startedAtMs,
        // Newer slots use boot/start ticks to avoid wall-clock drift; older readers drop them.
        ...(lock.linuxStartTicks && lock.bootId
          ? { linuxStartTicks: lock.linuxStartTicks, bootId: lock.bootId }
          : {}),
        nonce: lock.nonce,
        lockPath
      }
    }
  }
}

export async function completeRemoteDolphindManagedStop(
  options: DolphindSlotOptions,
  request: DolphindManagedStopRequest
): Promise<DolphindManagedStopCompletion> {
  return DolphindManagedStopCompletionSchema.parse(
    await runSlotCommand(options, request, DOLPHIND_COMPLETE_MANAGED_STOP_FLAG)
  )
}

export async function cancelRemoteDolphindManagedStop(
  options: DolphindSlotOptions,
  request: DolphindManagedStopRequest
): Promise<DolphindManagedStopCancellation> {
  return DolphindManagedStopCancellationSchema.parse(
    await runSlotCommand(options, request, DOLPHIND_CANCEL_MANAGED_STOP_FLAG)
  )
}

// The slot's own build owns its stop-request format.
async function runSlotCommand(
  options: DolphindSlotOptions,
  request: DolphindManagedStopRequest,
  flag: string
): Promise<unknown> {
  const slotDir = dolphindSlotDir(options, request.version)
  const entry = joinRemotePath(options.host, slotDir, 'dolphind.js')
  const output = isWindowsRemoteHost(options.host)
    ? await runWindowsSlotCommand(options, slotDir, entry, request, flag)
    : await execDolphindRemote(
        options,
        `${selectDolphindSlotRuntimeCommand(options.host, slotDir, options.nodePath)} && ` +
          `"$dolphind_runtime" ${quotePosixShell(entry)} ${flag} ${quotePosixShell(JSON.stringify(request))}`
      )
  const line = output
    .trim()
    .split('\n')
    .findLast((candidate) => candidate.trim().startsWith('{'))
  if (!line) {
    throw new Error('dolphind managed stop command returned no verifiable answer')
  }
  const parsed: unknown = JSON.parse(line)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('dolphind managed stop command returned no verifiable answer')
  }
  if (!('transactionId' in parsed) || parsed.transactionId !== request.transactionId) {
    throw new Error('dolphind managed stop command answered another transaction')
  }
  return parsed
}

// Stage JSON on Windows to avoid two command-line quoting layers.
async function runWindowsSlotCommand(
  options: DolphindSlotOptions,
  slotDir: string,
  entry: string,
  request: DolphindManagedStopRequest,
  flag: string
): Promise<string> {
  const runtime = readDolphindWindowsEncodedAnswer(
    await execDolphindRemote(
      options,
      dolphindWindowsSlotOpCommand(options.host, slotDir, 'slot-runtime', [slotDir])
    ),
    DOLPHIND_WINDOWS_RUNTIME_MARKER
  )
  if (!runtime) {
    throw new Error('The Windows host did not name the runtime this dolphind slot needs.')
  }
  const staged = joinRemotePath(
    options.host,
    slotDir,
    `.dolphind-stop-command-${randomUUID()}.json`
  )
  let removeStaged = true
  try {
    await options.conn.writeFile(staged, JSON.stringify(request), {
      hostPlatform: options.host,
      signal: options.signal
    })
    return await execDolphindRemote(
      options,
      dolphindWindowsNodeCommandLine(runtime, [
        entry,
        flag,
        DOLPHIND_MANAGED_STOP_REQUEST_FILE_FLAG,
        staged
      ])
    )
  } catch (error) {
    // Unconfirmed commands may still be reading the staged request.
    removeStaged = !isUnconfirmedSshCommandTermination(error)
    throw error
  } finally {
    if (removeStaged) {
      await execDolphindRemote(
        options,
        dolphindWindowsSlotOpCommand(options.host, slotDir, 'remove-file', [staged])
      ).catch(() => {})
    }
  }
}
