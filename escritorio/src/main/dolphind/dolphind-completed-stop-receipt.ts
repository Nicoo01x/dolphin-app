import { lstatSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import { readNodeFileSyncWithinLimit } from '../../shared/file-content/node-bounded-file-reader'
import { writeDurableSecureJsonFile } from '../../shared/secure-storage/secure-file'
import { hasErrorCode } from '../daemon/endpoint/identity/daemon-process-inspection'
import {
  DOLPHIND_STOP_RECEIPTS_DIRNAME,
  DolphindCompletedStopReceiptSchema,
  DolphindManagedStopRequestSchema,
  DolphindDaemonRetirementRecordSchema,
  dolphindManagedStopRequestKey,
  type DolphindCompletedStopReceipt,
  type DolphindDaemonRetirementRecord,
  type DolphindManagedStopRequest
} from '../../shared/dolphind-stop-request'

const RECEIPT_MAX_BYTES = 64 * 1024

type ReceiptKind = 'completed' | 'retirement' | 'decision'

export function dolphindStopReceiptPath(
  request: DolphindManagedStopRequest,
  kind: ReceiptKind
): string {
  const { transactionId, instance } = DolphindManagedStopRequestSchema.parse(request)
  const suffix = kind === 'completed' ? '' : `.${kind}`
  return join(
    dirname(instance.lockPath),
    DOLPHIND_STOP_RECEIPTS_DIRNAME,
    `${transactionId}${suffix}.json`
  )
}

/** Absent returns null; mismatched request receipts throw. */
export function readDolphindStopReceipt<T extends { request: DolphindManagedStopRequest }>(
  request: DolphindManagedStopRequest,
  kind: ReceiptKind,
  schema: z.ZodType<T>
): T | null {
  const path = dolphindStopReceiptPath(request, kind)
  try {
    if (!lstatSync(path).isFile()) {
      throw new Error('dolphind_stop_receipt_unverifiable')
    }
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return null
    }
    throw error
  }
  const receipt = schema.parse(
    JSON.parse(readNodeFileSyncWithinLimit(path, RECEIPT_MAX_BYTES).buffer.toString('utf8'))
  )
  if (dolphindManagedStopRequestKey(receipt.request) !== dolphindManagedStopRequestKey(request)) {
    throw new Error('dolphind_stop_receipt_mismatch')
  }
  return receipt
}

function writeReceipt(
  request: DolphindManagedStopRequest,
  kind: ReceiptKind,
  receipt: unknown
): void {
  if (!writeDurableSecureJsonFile(dolphindStopReceiptPath(request, kind), receipt)) {
    throw new Error('dolphind_stop_receipt_permissions_unconfirmed')
  }
}

export function readDolphindCompletedStopReceipt(
  request: DolphindManagedStopRequest
): DolphindCompletedStopReceipt | null {
  return readDolphindStopReceipt(request, 'completed', DolphindCompletedStopReceiptSchema)
}

/** Persist only after proven exit and fsync even existing receipts.
 * Missing retirement records remain unverifiable. */
export function persistDolphindCompletedStopReceipt(
  request: DolphindManagedStopRequest,
  exitedAt: Date
): DolphindCompletedStopReceipt {
  const parsed = DolphindManagedStopRequestSchema.parse(request)
  const retirement = parsed.retireIdleDaemon
    ? (readDolphindDaemonRetirementRecord(parsed)?.retirement ?? 'unverifiable')
    : undefined
  const receipt = readDolphindCompletedStopReceipt(parsed) ?? {
    schemaVersion: 1 as const,
    kind: 'dolphind_managed_stop_completed' as const,
    request: parsed,
    exitedAt: exitedAt.toISOString(),
    ...(retirement ? { retirement } : {})
  }
  writeReceipt(parsed, 'completed', receipt)
  return receipt
}

export function readDolphindDaemonRetirementRecord(
  request: DolphindManagedStopRequest
): DolphindDaemonRetirementRecord | null {
  return readDolphindStopReceipt(request, 'retirement', DolphindDaemonRetirementRecordSchema)
}

export function persistDolphindDaemonRetirementRecord(
  request: DolphindManagedStopRequest,
  outcome: Pick<DolphindDaemonRetirementRecord, 'retirement' | 'liveSessions' | 'reason'>
): void {
  writeReceipt(request, 'retirement', {
    schemaVersion: 1,
    kind: 'dolphind_managed_stop_retirement',
    request: DolphindManagedStopRequestSchema.parse(request),
    // Name fields explicitly; extra in-process fields would fail the strict schema.
    retirement: outcome.retirement,
    liveSessions: outcome.liveSessions,
    reason: outcome.reason
  })
}
