// Reconcile interrupted transactions to the recorded slot and state; retain the fence whenever ownership remains unproven.
import type { ServeReadiness } from '../../server/serve-readiness'
import {
  planDolphindTransactionRecovery,
  type DolphindActivationTransaction
} from './dolphind-activation-transaction'
import { readDolphindActivationTransaction } from './dolphind-activation-transaction-store'
import {
  readDolphindActivationRecord,
  writeDolphindActivationRecord
} from './dolphind-activation-record-store'
import {
  dolphindActivationFenceExists,
  withStaleDolphindActivationRecoveryLock
} from './dolphind-activation-lock'
import { RemoteInstallLockBusyError } from '../install/remote-install-lock'
import { ensureDolphindSlotServing, resolveDolphindSlotIdentity } from './dolphind-recovery-slot'
import { reconcileDolphindDecommission } from '../lifecycle/dolphind-decommission-recovery'
import {
  recoverDolphindIncumbent,
  type DolphindIncumbentRecoveryOptions
} from './dolphind-incumbent-recovery'
import type { DolphindManagedRefusal } from '../../../shared/dolphind-managed-runtime'
import { resumeInterruptedDolphindCandidate } from './dolphind-interrupted-candidate-resume'
import { errorMessage } from '../../../shared/error-message'
import { isDolphindLaunchFailure } from './dolphind-launch-failure'

export type DolphindActivationRecoveryResult =
  | { outcome: 'none' }
  | { outcome: 'pending'; code: string; reason: string }
  | {
      outcome: 'recovered'
      resolution: 'committed' | 'restored-incumbent'
      activeVersion: string | null
      readiness: ServeReadiness | null
    }
  /** A launch failure behind an unverifiable refusal still ended a run. */
  | (DolphindManagedRefusal & { launchFailure?: Error })

type DolphindActivationRecoveryOptions = DolphindIncumbentRecoveryOptions

export const DOLPHIND_RECOVERY_UNVERIFIABLE_CODE = 'dolphind_recovery_unverifiable'

/** Both pre-fence answers, read moments ago on this connect; they only skip the same two reads. */
export type DolphindActivationIdlePreRead = { transactionAbsent: boolean; fenceOpen: boolean }

export async function recoverInterruptedDolphindActivation(
  options: DolphindActivationRecoveryOptions,
  preRead?: DolphindActivationIdlePreRead
): Promise<DolphindActivationRecoveryResult> {
  if (preRead?.transactionAbsent && preRead.fenceOpen) {
    return { outcome: 'none' }
  }
  try {
    if (
      !(await readDolphindActivationTransaction(options)) &&
      !(await dolphindActivationFenceExists(options))
    ) {
      return { outcome: 'none' }
    }
    return await withStaleDolphindActivationRecoveryLock(options, async (lock) => {
      const transaction = await readDolphindActivationTransaction(options)
      if (!transaction) {
        // Interrupted release can remove the journal before the fence; finishing release is enough.
        return { outcome: 'none' }
      }
      const result = await reconcileDolphindTransaction(options, transaction)
      if (result.outcome !== 'recovered') {
        lock.retain()
      }
      return result
    })
  } catch (error) {
    if (error instanceof RemoteInstallLockBusyError) {
      return {
        outcome: 'pending',
        code: 'dolphind_recovery_transaction_still_fresh',
        reason:
          'The activation fence is held by a run that may still be working. Retry after the ' +
          'install lock recovery window.'
      }
    }
    return {
      outcome: 'refused',
      verdict: 'unverifiable',
      code: DOLPHIND_RECOVERY_UNVERIFIABLE_CODE,
      reason:
        `The interrupted activation could not be reconciled safely: ${errorMessage(error)} ` +
        'The host remains fenced.',
      ...(isDolphindLaunchFailure(error) ? { launchFailure: error } : {})
    }
  }
}

/** Requires a held fence; unverifiable steps throw to preserve it. */
async function reconcileDolphindTransaction(
  options: DolphindActivationRecoveryOptions,
  transaction: DolphindActivationTransaction
): Promise<DolphindActivationRecoveryResult> {
  const plan = planDolphindTransactionRecovery(
    transaction,
    await readDolphindActivationRecord(options)
  )
  if (plan.action === 'refuse') {
    return { outcome: 'refused', verdict: 'unverifiable', code: plan.code, reason: plan.reason }
  }
  if (
    plan.action === 'confirm-decommissioned' ||
    plan.action === 'resume-stop' ||
    plan.action === 'keep-serving'
  ) {
    return reconcileDolphindDecommission(options, plan)
  }
  if (plan.action === 'finish-commit') {
    await writeDolphindActivationRecord(options, plan.record)
  }
  if (plan.action === 'stabilize-committed' || plan.action === 'finish-commit') {
    const activeVersion = plan.action === 'finish-commit' ? plan.record.active : plan.activeVersion
    if (!activeVersion) {
      throw new Error('The committed activation record has no active version.')
    }
    const identity = await resolveDolphindSlotIdentity(options, activeVersion)
    return {
      outcome: 'recovered',
      resolution: 'committed',
      activeVersion,
      readiness: await ensureDolphindSlotServing(options, identity)
    }
  }
  let launchFailure: Error | undefined
  if (transaction.operation === 'activate' && plan.launchedVersion) {
    const readiness = await resumeInterruptedDolphindCandidate(options, transaction)
    if (readiness && 'outcome' in readiness) {
      return readiness
    }
    if (readiness && 'launchFailure' in readiness) {
      launchFailure = readiness.launchFailure
    } else if (readiness) {
      return {
        outcome: 'recovered',
        resolution: 'committed',
        activeVersion: transaction.candidateVersion,
        readiness
      }
    }
  }
  const recovery = await recoverDolphindIncumbent(options, {
    transactionStartedAt: transaction.startedAt,
    launchedVersion: plan.launchedVersion,
    incumbent: plan.activeVersion
      ? await resolveDolphindSlotIdentity(options, plan.activeVersion)
      : null,
    restoreState: plan.restoreState,
    launchedFromState: plan.launchedFromState
  })
  return recovery.outcome === 'refused'
    ? { ...recovery, ...(launchFailure ? { launchFailure } : {}) }
    : {
        outcome: 'recovered',
        resolution: 'restored-incumbent',
        activeVersion: plan.activeVersion,
        readiness: recovery.readiness
      }
}
