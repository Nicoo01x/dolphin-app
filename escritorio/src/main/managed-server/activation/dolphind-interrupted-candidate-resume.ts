/** Resume through the original readiness gate before undoing: the candidate may already serve changed state, and stopping it could require operator consent before anything can serve again. */
import type { ServeReadiness } from '../../server/serve-readiness'
import { withActivatedVersion } from './dolphind-activation-record'
import { writeDolphindActivationRecord } from './dolphind-activation-record-store'
import type { DolphindActivateTransaction } from './dolphind-activation-transaction'
import { writeDolphindActivationTransaction } from './dolphind-activation-transaction-store'
import { withDolphindActivationCandidateReady } from './dolphind-activation-transaction-transitions'
import { DolphindActiveReadinessError } from './dolphind-active-readiness'
import { dolphindLivenessProvenExited } from '../install/dolphind-remote-launch'
import {
  DOLPHIND_RECOVERY_CHANGED_STATE_CODE,
  type DolphindManagedRefusal
} from '../../../shared/dolphind-managed-runtime'
import {
  ensureDolphindSlotServing,
  dolphindSlotDir,
  resolveDolphindSlotIdentity,
  slotLiveness
} from './dolphind-recovery-slot'
import type { DolphindIncumbentRecoveryOptions } from './dolphind-incumbent-recovery'
import { isDolphindLaunchFailure } from './dolphind-launch-failure'

/** Under the held fence, return null (or the candidate's launch failure) for undo; a refusal leaves the host untouched for an operator. */
export async function resumeInterruptedDolphindCandidate(
  options: DolphindIncumbentRecoveryOptions,
  transaction: DolphindActivateTransaction
): Promise<ServeReadiness | DolphindManagedRefusal | { launchFailure: Error } | null> {
  const snapshotState = transaction.snapshot.state
  const incumbent = transaction.recordBefore.active
  if (
    transaction.phase !== 'snapshot-captured' ||
    snapshotState === 'pending' ||
    // A serving incumbent holds the port and instance lock; undo keeps it.
    (incumbent !== null &&
      !dolphindLivenessProvenExited(
        await slotLiveness(options, dolphindSlotDir(options, incumbent))
      ))
  ) {
    return null
  }
  const candidate = await resolveDolphindSlotIdentity(options, transaction.candidateVersion)
  const candidateLiveness = await slotLiveness(options, candidate.remoteDir)
  // Old journals lack candidate app version, so commit would drop downgrade protection; undo a possibly serving candidate only with consent.
  if (transaction.candidateAppVersion === undefined) {
    if (dolphindLivenessProvenExited(candidateLiveness) || options.acceptChangedState) {
      return null
    }
    if (candidateLiveness === 'UNKNOWN') {
      throw new Error(`Could not tell whether dolphind ${transaction.candidateVersion} is running.`)
    }
    return {
      outcome: 'refused',
      verdict: 'live',
      code: DOLPHIND_RECOVERY_CHANGED_STATE_CODE,
      reason:
        `An older Dolphin left version ${transaction.candidateVersion} running without finishing ` +
        'its update, and did not record which app started it, so it was neither committed nor ' +
        'stopped. Recover to stop it, restore the prelaunch snapshot and restart the previous ' +
        'build; what it changed is discarded.'
    }
  }
  // Undo must rule out an unprovable candidate before starting another slot.
  if (candidateLiveness === 'UNKNOWN') {
    return null
  }
  let readiness: ServeReadiness
  try {
    readiness = await ensureDolphindSlotServing(options, candidate)
  } catch (error) {
    // Only candidate evidence permits undo; unanswered hosts retain the fence.
    if (error instanceof DolphindActiveReadinessError && error.verdict !== 'unverifiable') {
      // Undo still follows; the failed candidate launch is a failed run all the same.
      return isDolphindLaunchFailure(error) ? { launchFailure: error } : null
    }
    throw error
  }
  const now = new Date()
  const recordAfter = withActivatedVersion(
    transaction.recordBefore,
    transaction.candidateVersion,
    snapshotState === 'captured'
      ? {
          dirName: transaction.snapshot.dirName,
          takenBeforeVersion: transaction.candidateVersion,
          readableByVersion: incumbent,
          takenAt: transaction.startedAt
        }
      : null,
    now,
    transaction.candidateAppVersion ?? undefined
  )
  await writeDolphindActivationTransaction(
    options,
    withDolphindActivationCandidateReady(transaction, recordAfter, now)
  )
  await writeDolphindActivationRecord(options, recordAfter)
  return readiness
}
