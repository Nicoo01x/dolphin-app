import { createHash } from 'node:crypto'
import { lstatSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readNodeFileSyncWithinLimit } from '../../shared/file-content/node-bounded-file-reader'
import {
  DOLPHIND_MANAGED_STOP_REQUEST_MAX_BYTES,
  DOLPHIND_MANAGED_STOP_REQUEST_PREFIX,
  DolphindManagedStopRequestSchema,
  type DolphindManagedStopContext,
  type DolphindManagedStopInstance,
  type DolphindManagedStopRequest
} from '../../shared/dolphind-stop-request'
import { readDolphindInstanceLockRecord, type DolphindLockRecord } from './dolphind-instance-lock'

/** Nonce-scoped paths prevent requests from addressing a previous instance. */
export function dolphindManagedStopRequestPath(instance: DolphindManagedStopInstance): string {
  const digest = createHash('sha256').update(instance.nonce).digest('hex')
  return join(dirname(instance.lockPath), `${DOLPHIND_MANAGED_STOP_REQUEST_PREFIX}.${digest}`)
}

export function readDolphindManagedStopRequest(path: string): DolphindManagedStopRequest {
  if (!lstatSync(path).isFile()) {
    throw new Error('dolphind_managed_stop_request_not_regular_file')
  }
  const { buffer } = readNodeFileSyncWithinLimit(path, DOLPHIND_MANAGED_STOP_REQUEST_MAX_BYTES)
  return DolphindManagedStopRequestSchema.parse(JSON.parse(buffer.toString('utf8')))
}

function sameDolphindManagedStopInstance(
  left: DolphindManagedStopInstance,
  right: Pick<DolphindManagedStopInstance, 'pid' | 'startedAtMs' | 'nonce'>
): boolean {
  return (
    left.pid === right.pid && left.startedAtMs === right.startedAtMs && left.nonce === right.nonce
  )
}

export function dolphindInstanceLockNames(instance: DolphindManagedStopInstance): boolean {
  return readDolphindInstanceLockNaming(instance) !== null
}

export function readDolphindInstanceLockNaming(
  instance: DolphindManagedStopInstance
): DolphindLockRecord | null {
  if (!lstatSync(instance.lockPath).isFile()) {
    return null
  }
  const record = readDolphindInstanceLockRecord(instance.lockPath)
  return record !== null && sameDolphindManagedStopInstance(instance, record) ? record : null
}

export function validateDolphindManagedStopRequest(
  context: DolphindManagedStopContext,
  requestPath: string
): DolphindManagedStopRequest {
  const request = readDolphindManagedStopRequest(requestPath)
  if (
    request.version !== context.version ||
    request.runtimeId !== context.runtimeId ||
    // Windows clients and servers may use different separators for the same lock.
    resolve(request.instance.lockPath) !== resolve(context.instance.lockPath) ||
    !sameDolphindManagedStopInstance(request.instance, context.instance)
  ) {
    throw new Error('dolphind_managed_stop_request_identity_mismatch')
  }
  if (!dolphindInstanceLockNames(context.instance)) {
    throw new Error('dolphind_managed_stop_instance_lock_changed')
  }
  return request
}
