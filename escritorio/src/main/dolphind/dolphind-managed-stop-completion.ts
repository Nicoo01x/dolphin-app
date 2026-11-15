// Request shutdown without signaling; only kernel identity, owner change or PID absence proves exit.
import { setTimeout as delay } from 'node:timers/promises'
import { writeDurableSecureJsonFile } from '../../shared/secure-storage/secure-file'
import {
  DolphindManagedStopRequestSchema,
  dolphindManagedStopRequestKey,
  type DolphindManagedStopInstance,
  type DolphindManagedStopRequest,
  type DolphindManagedStopVerdict
} from '../../shared/dolphind-stop-request'
import {
  compareDolphindProcessIdentity,
  recordedDolphindProcessIncarnation,
  type DolphindProcessIdentityReaders,
  type DolphindRecordedIdentity
} from './dolphind-process-start-time'
import {
  hasErrorCode,
  inspectProcessSignal
} from '../daemon/endpoint/identity/daemon-process-inspection'
import { persistDolphindCompletedStopReceipt } from './dolphind-completed-stop-receipt'
import { readDolphindManagedStopDecision } from './dolphind-managed-stop-decision'
import { withdrawDolphindManagedStopRequest } from './dolphind-managed-stop-cancellation'
import {
  dolphindInstanceLockNames,
  dolphindManagedStopRequestPath,
  readDolphindInstanceLockNaming,
  readDolphindManagedStopRequest
} from './dolphind-managed-stop-request'
import {
  DOLPHIND_STOP_COMPLETION_POLL_ATTEMPTS,
  DOLPHIND_STOP_COMPLETION_POLL_MS
} from './dolphind-stop-deadlines'

type DolphindProcessProbe = (pid: number) => 'alive' | 'missing' | 'unverifiable'

export type DolphindManagedStopCompletionOptions = DolphindProcessIdentityReaders & {
  probeProcess?: DolphindProcessProbe
  sleep?: () => Promise<void>
  attempts?: number
  now?: () => Date
}

function defaultProbe(pid: number): ReturnType<DolphindProcessProbe> {
  const signal = inspectProcessSignal(pid)
  // EPERM proves some process holds the PID; it cannot prove ours exited.
  return signal === 'occupied' ? 'alive' : signal === 'missing' ? 'missing' : 'unverifiable'
}

function observeInstance(
  instance: DolphindManagedStopInstance,
  recorded: DolphindRecordedIdentity,
  options: DolphindManagedStopCompletionOptions
): DolphindManagedStopVerdict {
  const probe = (options.probeProcess ?? defaultProbe)(instance.pid)
  if (probe !== 'alive') {
    return probe === 'missing' ? 'exited' : 'unverifiable'
  }
  // Wall-clock drift alone cannot prove PID reuse.
  const identity = compareDolphindProcessIdentity(instance.pid, recorded, options)
  return identity === 'differs' ? 'exited' : identity === 'unproven' ? 'unverifiable' : 'live'
}

/** Recover incarnation data from the lock for older clients that omit it. */
function recordedIdentity(instance: DolphindManagedStopInstance): DolphindRecordedIdentity {
  if (recordedDolphindProcessIncarnation(instance)) {
    return instance
  }
  let record: DolphindRecordedIdentity | null = null
  try {
    record = readDolphindInstanceLockNaming(instance)
  } catch {
    return instance
  }
  if (!record) {
    return instance
  }
  return { ...instance, ...recordedDolphindProcessIncarnation(record), identity: record.identity }
}

export async function completeDolphindManagedStop(
  input: DolphindManagedStopRequest,
  options: DolphindManagedStopCompletionOptions = {}
): Promise<DolphindManagedStopVerdict> {
  const request = DolphindManagedStopRequestSchema.parse(input)
  const attempts = options.attempts ?? DOLPHIND_STOP_COMPLETION_POLL_ATTEMPTS
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 240) {
    throw new Error('dolphind_managed_stop_invalid_attempts')
  }
  const completed = (): 'exited' => {
    persistDolphindCompletedStopReceipt(request, (options.now ?? (() => new Date()))())
    return 'exited'
  }
  const recorded = recordedIdentity(request.instance)
  let verdict = observeInstance(request.instance, recorded, options)
  if (verdict !== 'live') {
    return verdict === 'exited' ? completed() : verdict
  }
  if (!lockStillNamesInstance(request.instance)) {
    // A live process that relinquished its lock is no longer ours to address.
    return 'unverifiable'
  }
  if (readDolphindManagedStopDecision(request) === 'canceled') {
    return 'live'
  }
  const requestPath = dolphindManagedStopRequestPath(request.instance)
  if (!existingRequestMatches(requestPath, request)) {
    return 'unverifiable'
  }
  if (!writeDurableSecureJsonFile(requestPath, request)) {
    throw new Error('dolphind_managed_stop_request_permissions_unconfirmed')
  }
  // A cancel between the first check and write had no request file to remove.
  if (readDolphindManagedStopDecision(request) === 'canceled') {
    withdrawDolphindManagedStopRequest(request)
    return 'live'
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    await (options.sleep ?? (() => delay(DOLPHIND_STOP_COMPLETION_POLL_MS)))()
    verdict = observeInstance(request.instance, recorded, options)
    if (verdict !== 'live') {
      return verdict === 'exited' ? completed() : verdict
    }
  }
  return 'live'
}

function lockStillNamesInstance(instance: DolphindManagedStopInstance): boolean {
  try {
    return dolphindInstanceLockNames(instance)
  } catch {
    return false
  }
}

function existingRequestMatches(path: string, request: DolphindManagedStopRequest): boolean {
  try {
    return (
      dolphindManagedStopRequestKey(readDolphindManagedStopRequest(path)) ===
      dolphindManagedStopRequestKey(request)
    )
  } catch (error) {
    return hasErrorCode(error, 'ENOENT')
  }
}
