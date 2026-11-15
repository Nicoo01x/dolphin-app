// Journal instance-bound stop under the activation fence; refuse live/unknown terminal census and deactivate only after proven exit.
import { randomUUID } from 'node:crypto'
import type { DolphindActivationRecord } from '../activation/dolphind-activation-record'
import {
  readDolphindActivationRecord,
  writeDolphindActivationRecord
} from '../activation/dolphind-activation-record-store'
import { sameDolphindActivationRecord } from '../activation/dolphind-activation-transaction'
import { writeDolphindActivationTransaction } from '../activation/dolphind-activation-transaction-store'
import { withDolphindActivationLock } from '../activation/dolphind-activation-lock'
import { dolphindActivationFenceRefusal } from '../activation/dolphind-activation-fence-hold'
import {
  committedDolphindDecommissionRecord,
  createDolphindDecommissionTransaction,
  withDolphindDecommissionProcessExited,
  withDolphindDecommissionStopDispatched
} from '../lifecycle/dolphind-decommission-transaction'
import { readRemoteDolphindManagedStopTarget } from '../lifecycle/dolphind-managed-remote-stop'
import { settleDolphindDecommissionStop } from '../lifecycle/dolphind-decommission-stop'
import type { DolphindSlotOptions } from '../activation/dolphind-recovery-slot'
import type { DolphindDecommissionResult } from '../../../shared/dolphind-decommission'
import type { DolphindTerminalCensus } from '../../../shared/dolphind-terminal-census'

type DolphindDecommissionOptions = DolphindSlotOptions & {
  /** Refuse if the host record changed since caller review. */
  record: DolphindActivationRecord
  /** Fresh census must prove no live or uncounted terminals. */
  census: DolphindTerminalCensus
  now?: () => Date
}

type Refusal = Extract<DolphindDecommissionResult, { outcome: 'refused' }>

function refuse(verdict: Refusal['verdict'], code: string, reason: string): Refusal {
  return { outcome: 'refused', verdict, code, reason }
}

function censusRefusal(census: DolphindTerminalCensus): Refusal | null {
  if (census.liveSessions === null) {
    return refuse(
      'unverifiable',
      'dolphind_decommission_census_unavailable',
      'The terminal daemon did not answer a session count, so decommissioning could end ' +
        'running work. Retry when the host answers.'
    )
  }
  if (census.liveSessions > 0) {
    return refuse(
      'live',
      'dolphind_decommission_terminals_running',
      `${census.liveSessions} terminal${census.liveSessions === 1 ? ' is' : 's are'} still ` +
        'running on this host. Close them before decommissioning the server.'
    )
  }
  return null
}

export async function decommissionRemoteDolphind(
  options: DolphindDecommissionOptions
): Promise<DolphindDecommissionResult> {
  const now = options.now ?? ((): Date => new Date())
  return withDolphindActivationLock(
    options,
    async (lock) => {
      const record = await readDolphindActivationRecord(options)
      if (!sameDolphindActivationRecord(record, options.record)) {
        return refuse(
          'unverifiable',
          'dolphind_decommission_record_changed',
          'The host activation record changed since it was reviewed. Refresh and try again.'
        )
      }
      const activeVersion = record.active
      if (!activeVersion) {
        return refuse(
          'unverifiable',
          'dolphind_decommission_nothing_active',
          'No dolphind version is active on this host, so there is nothing to decommission.'
        )
      }
      const census = censusRefusal(options.census)
      if (census) {
        return census
      }
      const target = await readRemoteDolphindManagedStopTarget(options, activeVersion)
      if (target.state === 'refused') {
        return refuse(target.verdict, target.code, target.reason)
      }

      let transaction = createDolphindDecommissionTransaction({
        transactionId: randomUUID(),
        recordBefore: { ...record, active: activeVersion },
        now: now()
      })
      await writeDolphindActivationTransaction(options, transaction)
      lock.retainOnError()
      const request = {
        schemaVersion: 1 as const,
        transactionId: transaction.transactionId,
        ...target.context,
        // Idle daemon retirement is best-effort; busy daemons retain their terminals.
        retireIdleDaemon: true as const
      }
      // Journal exact stop intent before dispatch so recovery can settle the same request.
      transaction = withDolphindDecommissionStopDispatched(transaction, request, now())
      await writeDolphindActivationTransaction(options, transaction)

      const settlement = await settleDolphindDecommissionStop(options, request)
      if (settlement.state === 'withdrawn') {
        return refuse(settlement.verdict, 'dolphind_decommission_stop_withdrawn', settlement.reason)
      }
      if (settlement.state === 'unsettled') {
        lock.retain()
        return refuse(settlement.verdict, 'dolphind_decommission_stop_unsettled', settlement.reason)
      }
      transaction = withDolphindDecommissionProcessExited(transaction, now())
      await writeDolphindActivationTransaction(options, transaction)
      await writeDolphindActivationRecord(options, committedDolphindDecommissionRecord(transaction))
      return {
        outcome: 'decommissioned',
        version: activeVersion,
        retirement: settlement.retirement
      }
    },
    async () => {
      const refusal = await dolphindActivationFenceRefusal(options, 'stop')
      return refuse('unverifiable', refusal.code, refusal.reason)
    }
  )
}
