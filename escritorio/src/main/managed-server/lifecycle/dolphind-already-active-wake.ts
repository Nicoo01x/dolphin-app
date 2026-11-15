import { DolphindCrashLoopError, wakeManagedDolphindUnlessCrashLooping } from './dolphind-managed-crash-loop'
import { wakeStoppedManagedDolphind } from './dolphind-managed-wake'
import type { DolphindSlotOptions } from '../activation/dolphind-recovery-slot'

/** Already-active deploys launch nothing; wake that slot only on proven exit, including after reboot. Return whether it was started. */
export async function wakeAlreadyActiveDolphind(
  options: DolphindSlotOptions,
  /** SSH-managed hosts share the crash-loop brake with every other automatic wake. */
  managed?: { environmentId: string; hostLabel: string }
): Promise<boolean> {
  const wake = managed
    ? await wakeManagedDolphindUnlessCrashLooping(managed.environmentId, managed.hostLabel, options)
    : await wakeStoppedManagedDolphind(options)
  if (wake.outcome === 'crash-loop') {
    throw new DolphindCrashLoopError(wake.detail)
  }
  if (wake.outcome === 'recovery-refused') {
    throw new Error(wake.reason)
  }
  return wake.outcome === 'started'
}
