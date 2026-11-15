import {
  dolphindActivationTransactionPath,
  parseDolphindActivationTransaction,
  serializeDolphindActivationTransaction,
  type DolphindActivationTransaction
} from './dolphind-activation-transaction'
import {
  readBoundedDolphindRemoteRecord,
  writeAtomicDolphindRemoteRecord
} from '../install/dolphind-remote-record-file'
import type { DolphindRemoteExecTarget } from '../install/dolphind-remote-runtime-control'
import { currentDolphindFence } from './dolphind-activation-fence-scope'

const DOLPHIND_ACTIVATION_TRANSACTION_MAX_BYTES = 64 * 1024

type DolphindActivationTransactionStoreOptions = DolphindRemoteExecTarget & { remoteHome: string }

/** Only verified absence returns null; unreadable journals retain the fence. */
export async function readDolphindActivationTransaction(
  options: DolphindActivationTransactionStoreOptions
): Promise<DolphindActivationTransaction | null> {
  const read = await readBoundedDolphindRemoteRecord(
    options,
    dolphindActivationTransactionPath(options.host, options.remoteHome),
    DOLPHIND_ACTIVATION_TRANSACTION_MAX_BYTES
  )
  const parsed = parseDolphindActivationTransaction(read.state === 'present' ? read.raw : null)
  if (parsed.state === 'unreadable') {
    throw new Error(`Cannot read this host's dolphind activation transaction: ${parsed.reason}`)
  }
  return parsed.state === 'ok' ? parsed.transaction : null
}

/** Stamp each write with its fence generation so release cannot delete another holder's journal. */
export function writeDolphindActivationTransaction(
  options: DolphindActivationTransactionStoreOptions,
  transaction: DolphindActivationTransaction
): Promise<void> {
  const fenceToken = currentDolphindFence()?.token
  return writeAtomicDolphindRemoteRecord(
    options,
    dolphindActivationTransactionPath(options.host, options.remoteHome),
    serializeDolphindActivationTransaction(
      fenceToken ? { ...transaction, fenceToken } : transaction
    )
  )
}
