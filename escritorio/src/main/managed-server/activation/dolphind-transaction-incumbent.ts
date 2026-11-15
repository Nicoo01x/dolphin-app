import type { DolphindActivationLockControl } from './dolphind-activation-lock'
import type { DolphindSnapshotVerdict } from './dolphind-activation-transaction'
import { dolphindStopFreedTheHost } from '../install/dolphind-remote-process-control'
import { withoutAbortSignal } from '../install/dolphind-remote-runtime-control'
import {
  launchDolphindSlot,
  stopDolphindSlot,
  DOLPHIND_SLOT_STOP_WAIT_SECONDS,
  type DolphindSlotIdentity,
  type DolphindSlotOptions
} from './dolphind-recovery-slot'
import { recoverDolphindIncumbent } from './dolphind-incumbent-recovery'
import { errorMessage } from '../../../shared/error-message'

/** Return null on proven exit; otherwise retain the fence when a delivered stop may still change the host. */
export async function stopTransactionIncumbent(
  options: DolphindSlotOptions,
  incumbent: DolphindSlotIdentity,
  lock: DolphindActivationLockControl
): Promise<{ reason: string; stopMayBeUnderway: boolean } | null> {
  const stopped = await stopDolphindSlot(options, incumbent.remoteDir, false)
  if (dolphindStopFreedTheHost(stopped)) {
    return null
  }
  // Only a stop that may have been delivered can still change the host; otherwise nothing happened.
  const stopMayBeUnderway = stopped === 'still-running' || stopped === 'unconfirmed'
  if (stopMayBeUnderway) {
    lock.retain()
  }
  return {
    reason:
      `Could not verify that dolphind ${incumbent.version} exited within ` +
      `${DOLPHIND_SLOT_STOP_WAIT_SECONDS}s (${stopped}).`,
    stopMayBeUnderway
  }
}

export async function restartAfterSnapshotFailure(
  options: DolphindSlotOptions,
  incumbent: DolphindSlotIdentity,
  lock: DolphindActivationLockControl
): Promise<string> {
  try {
    await launchDolphindSlot(withoutAbortSignal(options), incumbent)
    lock.recovered()
    return `dolphind ${incumbent.version} was restarted and is serving again.`
  } catch (error) {
    lock.retain()
    return `restarting dolphind ${incumbent.version} failed: ${errorMessage(error)} This host requires recovery.`
  }
}

/** Restore changed state and incumbent only after both slots prove exit; refusal retains the fence. */
export async function putTransactionIncumbentBack(
  options: DolphindSlotOptions,
  lock: DolphindActivationLockControl,
  input: {
    transactionStartedAt: string
    launchedVersion: string | null
    incumbent: DolphindSlotIdentity | null
    restoreState: DolphindSnapshotVerdict | null
    launchedFromState?: DolphindSnapshotVerdict | null
  }
): Promise<string | null> {
  try {
    const recovery = await recoverDolphindIncumbent(withoutAbortSignal(options), {
      ...input,
      slotsProvenExited: true
    })
    if (recovery.outcome === 'refused') {
      lock.retain()
      return recovery.reason
    }
    lock.recovered()
    return null
  } catch (error) {
    lock.retain()
    return `Restoring the previous version failed: ${errorMessage(error)} This host requires recovery.`
  }
}

/** Stop the rejected candidate before safely restoring incumbent state. */
export async function restoreAfterRejectedCandidate(
  options: DolphindSlotOptions,
  lock: DolphindActivationLockControl,
  input: {
    launchedDir: string
    launchedVersion: string
    transactionStartedAt: string
    incumbent: DolphindSlotIdentity | null
    restoreState: DolphindSnapshotVerdict | null
    launchedFromState?: DolphindSnapshotVerdict | null
  }
): Promise<string> {
  const { launchedDir, ...restore } = input
  const stopped = await stopDolphindSlot(withoutAbortSignal(options), launchedDir, true).catch(
    (error: unknown) => `unverifiable: ${errorMessage(error)}`
  )
  if (stopped !== 'stopped' && stopped !== 'already-exited') {
    lock.retain()
    return (
      `dolphind ${input.launchedVersion} could not be confirmed stopped (${stopped}), so nothing ` +
      'was restored over state it may still own. This host requires recovery.'
    )
  }
  const failure = await putTransactionIncumbentBack(options, lock, restore)
  return (
    failure ??
    (input.incumbent
      ? `dolphind ${input.incumbent.version} was restarted and is serving again.`
      : 'No previous version was active, so this host is now serving nothing.')
  )
}
