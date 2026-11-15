/** Pin every journaled slot needed for recovery. An unreadable journal or unjournaled held fence hides transaction state, so GC must retain everything. */
import { dolphindInstallDirNames } from './dolphind-activation-record'
import type { DolphindActivationTransaction } from './dolphind-activation-transaction'
import { readDolphindActivationTransaction } from './dolphind-activation-transaction-store'
import { dolphindActivationFenceExists } from './dolphind-activation-lock'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import type { DolphindRemoteExecTarget } from '../install/dolphind-remote-runtime-control'

type DolphindGcTransactionPins = { state: 'pinned'; dirNames: string[] } | { state: 'keep-all' }

function transactionVersions(transaction: DolphindActivationTransaction): (string | null)[] {
  const records = [transaction.recordBefore, transaction.recordAfter]
  const fromRecords = records.flatMap((record) => (record ? [record.active, record.previous] : []))
  if (transaction.operation === 'activate') {
    return [...fromRecords, transaction.candidateVersion]
  }
  return transaction.operation === 'rollback'
    ? [...fromRecords, transaction.incumbentVersion, transaction.targetVersion]
    : fromRecords
}

export async function readDolphindGcTransactionPins(
  target: DolphindRemoteExecTarget & { remoteHome: string },
  /** The caller holds the activation fence, so its presence says nothing about another owner. */
  options: { callerHoldsFence?: boolean } = {}
): Promise<DolphindGcTransactionPins> {
  try {
    const transaction = await readDolphindActivationTransaction(target)
    if (!transaction) {
      // An unjournaled fence may be a transaction starting or an interrupted release.
      return !options.callerHoldsFence && (await dolphindActivationFenceExists(target))
        ? { state: 'keep-all' }
        : { state: 'pinned', dirNames: [] }
    }
    return { state: 'pinned', dirNames: dolphindInstallDirNames(transactionVersions(transaction)) }
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    return { state: 'keep-all' }
  }
}
