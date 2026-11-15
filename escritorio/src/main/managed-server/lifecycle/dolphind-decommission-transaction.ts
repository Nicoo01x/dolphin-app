// Only process-exited may commit; dispatched phases nest under prepared for released readers.
import {
  serializeDolphindActivationRecord,
  withDeactivatedVersion,
  withDeactivatedVersionCommitted,
  type DolphindActivationRecord
} from '../activation/dolphind-activation-record'
import { DOLPHIND_ACTIVATION_TRANSACTION_SCHEMA_VERSION } from '../activation/dolphind-activation-transaction-schema'
import type { DolphindManagedStopRequest } from '../../../shared/dolphind-stop-request'

export type DolphindDecommissionTransaction = {
  schemaVersion: typeof DOLPHIND_ACTIVATION_TRANSACTION_SCHEMA_VERSION
  transactionId: string
  operation: 'decommission'
  phase: 'prepared' | 'stop-dispatched' | 'process-exited'
  startedAt: string
  updatedAt: string
  activeVersion: string
  recordBefore: DolphindActivationRecord
  recordAfter: DolphindActivationRecord
  request: DolphindManagedStopRequest | null
}

/** Released desktops drop this field. */
type DolphindDecommissionDispatch = {
  phase: 'stop-dispatched' | 'process-exited'
  request: DolphindManagedStopRequest
}

type DolphindDecommissionJournal = Omit<DolphindDecommissionTransaction, 'phase' | 'request'> & {
  phase: 'prepared'
  request: null
  dispatched?: DolphindDecommissionDispatch
}

export type DolphindDecommissionRecoveryPlan =
  | { action: 'confirm-decommissioned'; version: string; record: DolphindActivationRecord | null }
  /** Completion or cancellation must settle a possibly delivered request. */
  | { action: 'resume-stop'; request: DolphindManagedStopRequest; record: DolphindActivationRecord }
  | { action: 'keep-serving'; version: string }

export function createDolphindDecommissionTransaction(options: {
  transactionId: string
  recordBefore: DolphindActivationRecord & { active: string }
  now: Date
}): DolphindDecommissionTransaction {
  const timestamp = options.now.toISOString()
  return {
    schemaVersion: DOLPHIND_ACTIVATION_TRANSACTION_SCHEMA_VERSION,
    transactionId: options.transactionId,
    operation: 'decommission',
    phase: 'prepared',
    startedAt: timestamp,
    updatedAt: timestamp,
    activeVersion: options.recordBefore.active,
    recordBefore: options.recordBefore,
    recordAfter: withDeactivatedVersion(options.recordBefore),
    request: null
  }
}

export function withDolphindDecommissionStopDispatched(
  transaction: DolphindDecommissionTransaction,
  request: DolphindManagedStopRequest,
  now: Date
): DolphindDecommissionTransaction {
  return { ...transaction, phase: 'stop-dispatched', updatedAt: now.toISOString(), request }
}

export function withDolphindDecommissionProcessExited(
  transaction: DolphindDecommissionTransaction,
  now: Date
): DolphindDecommissionTransaction {
  return { ...transaction, phase: 'process-exited', updatedAt: now.toISOString() }
}

/** Keep top-level prepared so released readers relaunch the recorded build instead of downgrading.
 * Their parser drops dispatched; their completed-stop path loses activeAppVersion protection. */
export function dolphindDecommissionJournal(
  transaction: DolphindDecommissionTransaction
): DolphindDecommissionJournal {
  const { phase, request, ...rest } = transaction
  return phase === 'prepared' || !request
    ? { ...rest, phase: 'prepared', request: null }
    : { ...rest, phase: 'prepared', request: null, dispatched: { phase, request } }
}

export function dolphindDecommissionTransactionDefect(
  transaction: DolphindDecommissionTransaction
): string | null {
  if (transaction.recordBefore.active !== transaction.activeVersion) {
    return 'decommission version does not match recordBefore'
  }
  if (
    serializeDolphindActivationRecord(transaction.recordAfter) !==
    serializeDolphindActivationRecord(withDeactivatedVersion(transaction.recordBefore))
  ) {
    return 'recordAfter is not the deactivated recordBefore'
  }
  if (transaction.request && transaction.request.version !== transaction.activeVersion) {
    return 'stop request names another version'
  }
  return null
}

export function planDolphindDecommissionRecovery(
  transaction: DolphindDecommissionTransaction,
  committed: boolean
): DolphindDecommissionRecoveryPlan {
  if (committed) {
    return { action: 'confirm-decommissioned', version: transaction.activeVersion, record: null }
  }
  if (transaction.phase === 'process-exited') {
    return {
      action: 'confirm-decommissioned',
      version: transaction.activeVersion,
      record: committedDolphindDecommissionRecord(transaction)
    }
  }
  if (transaction.phase === 'stop-dispatched' && transaction.request) {
    return {
      action: 'resume-stop',
      request: transaction.request,
      record: committedDolphindDecommissionRecord(transaction)
    }
  }
  return { action: 'keep-serving', version: transaction.activeVersion }
}

/** Preserve advisory fields alongside the journaled recordAfter. */
export function committedDolphindDecommissionRecord(
  transaction: DolphindDecommissionTransaction
): DolphindActivationRecord {
  return withDeactivatedVersionCommitted(transaction.recordBefore)
}
