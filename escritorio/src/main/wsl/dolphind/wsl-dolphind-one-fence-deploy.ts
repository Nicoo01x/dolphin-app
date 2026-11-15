/**
 * A same-version WSL connect takes one activation fence instead of two: the deploy confirms the
 * slot is installed and skips its own fence, then the wake's fence re-reads the record and starts
 * the slot if it stopped. A fence the snapshot saw held, another version active by then, or a busy
 * fence all run the full deploy and wake, as before.
 */
import type { DolphindActivationRecord } from '../../managed-server/activation/dolphind-activation-record'
import { wakeExpectedDolphindUnderOneFence } from '../../managed-server/lifecycle/dolphind-managed-wake'
import type {
  DolphindDeployOptions,
  DolphindDeployResult
} from '../../managed-server/install/dolphind-remote-deploy'
import type { DolphindSlotOptions } from '../../managed-server/activation/dolphind-recovery-slot'

type DeployExtra = Pick<DolphindDeployOptions, 'preRead' | 'sameVersionFencedByCaller'>

export async function deployWslDolphindWithOneFence(
  slot: DolphindSlotOptions,
  deploy: (extra: DeployExtra) => Promise<DolphindDeployResult>,
  hinted: { preRead?: { record: DolphindActivationRecord; fenceOpen: boolean } }
): Promise<{ deployed: DolphindDeployResult; woken: boolean }> {
  if (!hinted.preRead?.fenceOpen) {
    return { deployed: await deploy(hinted), woken: false }
  }
  const first = await deploy({ ...hinted, sameVersionFencedByCaller: true })
  if (first.outcome !== 'already-active') {
    return { deployed: first, woken: false }
  }
  const wake = await wakeExpectedDolphindUnderOneFence(slot, first.fullVersion)
  if (wake.outcome === 'replan' || wake.outcome === 'fenced') {
    // The host moved since the snapshot, so this deploy takes no hints.
    return { deployed: await deploy({}), woken: false }
  }
  if (wake.outcome === 'recovery-refused') {
    throw new Error(wake.reason)
  }
  return { deployed: first, woken: true }
}
