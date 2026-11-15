import type { DolphindActivationRecord } from './dolphind-activation-record'
import { DOLPHIND_ACTIVATION_TRANSACTION_SCHEMA_VERSION } from './dolphind-activation-transaction-schema'
import type {
  DolphindActivateTransaction,
  DolphindRollbackTransaction
} from './dolphind-activation-transaction'

export function createDolphindActivationTransaction(options: {
  transactionId: string
  candidateVersion: string
  appVersion?: string
  recordBefore: DolphindActivationRecord
  snapshotDirName: string
  now: Date
}): DolphindActivateTransaction {
  const timestamp = options.now.toISOString()
  return {
    schemaVersion: DOLPHIND_ACTIVATION_TRANSACTION_SCHEMA_VERSION,
    transactionId: options.transactionId,
    operation: 'activate',
    phase: 'prepared',
    startedAt: timestamp,
    updatedAt: timestamp,
    candidateVersion: options.candidateVersion,
    candidateAppVersion: options.appVersion ?? null,
    recordBefore: options.recordBefore,
    recordAfter: null,
    snapshot: { dirName: options.snapshotDirName, state: 'pending' }
  }
}

export function withDolphindActivationIncumbentStopped(
  transaction: DolphindActivateTransaction,
  now: Date
): DolphindActivateTransaction {
  return {
    ...transaction,
    phase: 'incumbent-stopped',
    updatedAt: now.toISOString()
  }
}

export function withDolphindActivationSnapshot(
  transaction: DolphindActivateTransaction,
  state: 'captured' | 'empty',
  now: Date
): DolphindActivateTransaction {
  return {
    ...transaction,
    phase: 'snapshot-captured',
    updatedAt: now.toISOString(),
    snapshot: { dirName: transaction.snapshot.dirName, state }
  }
}

export function withDolphindActivationCandidateReady(
  transaction: DolphindActivateTransaction,
  recordAfter: DolphindActivationRecord,
  now: Date
): DolphindActivateTransaction {
  return {
    ...transaction,
    phase: 'candidate-ready',
    updatedAt: now.toISOString(),
    recordAfter
  }
}

export function createDolphindRollbackTransaction(options: {
  transactionId: string
  incumbentVersion: string
  targetVersion: string
  recordBefore: DolphindActivationRecord
  recordAfter: DolphindActivationRecord
  rescueDirName: string
  now: Date
}): DolphindRollbackTransaction {
  const timestamp = options.now.toISOString()
  return {
    schemaVersion: DOLPHIND_ACTIVATION_TRANSACTION_SCHEMA_VERSION,
    transactionId: options.transactionId,
    operation: 'rollback',
    phase: 'prepared',
    startedAt: timestamp,
    updatedAt: timestamp,
    incumbentVersion: options.incumbentVersion,
    targetVersion: options.targetVersion,
    recordBefore: options.recordBefore,
    recordAfter: options.recordAfter,
    rescue: { dirName: options.rescueDirName, state: 'pending' }
  }
}

export function withDolphindRollbackPhase(
  transaction: DolphindRollbackTransaction,
  phase: 'incumbent-stopped' | 'rollback-state-restored' | 'target-ready',
  now: Date
): DolphindRollbackTransaction {
  return { ...transaction, phase, updatedAt: now.toISOString() }
}

export function withDolphindRollbackRescue(
  transaction: DolphindRollbackTransaction,
  state: 'captured' | 'empty',
  now: Date
): DolphindRollbackTransaction {
  return {
    ...transaction,
    phase: 'rescue-captured',
    updatedAt: now.toISOString(),
    rescue: { dirName: transaction.rescue.dirName, state }
  }
}
