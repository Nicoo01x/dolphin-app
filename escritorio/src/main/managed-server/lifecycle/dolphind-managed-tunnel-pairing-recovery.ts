// Only refusals sealed by the pinned key may trigger repair; foreign servers fail identity checks.
import type { KnownRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { pairingRevisionOf, type ManagedDolphindPairingGate } from './dolphind-managed-pairing-repair'
import {
  DolphindManagedIdentityError,
  DolphindManagedPairingRejectedError
} from './dolphind-managed-tunnel-identity'

export type ManagedDolphindPairingRecovery = {
  resolve: (environmentId: string) => KnownRuntimeEnvironment
  repairs: ManagedDolphindPairingGate
  ensure: (environment: KnownRuntimeEnvironment) => Promise<void>
}

/** Check cached refusal before building; permit one repair and rebuild on a refused pairing. */
export async function buildWithPairingRepair(
  recovery: ManagedDolphindPairingRecovery,
  environmentId: string,
  build: (environment: KnownRuntimeEnvironment) => Promise<void>
): Promise<'built' | 'repaired'> {
  const refused = recovery.resolve(environmentId)
  const epoch = recovery.repairs.resetEpoch(environmentId)
  const standing = recovery.repairs.standingFailure(environmentId, pairingRevisionOf(refused))
  if (standing) {
    throw standing
  }
  try {
    await build(refused)
    return 'built'
  } catch (error) {
    if (error instanceof DolphindManagedIdentityError && error.kind === 'replaced-server') {
      throw recovery.repairs.recordStandingRefusal(
        environmentId,
        pairingRevisionOf(refused),
        epoch,
        error
      )
    }
    if (!(error instanceof DolphindManagedPairingRejectedError)) {
      throw error
    }
    console.warn('[managed-dolphind] The Dolphin server refused this desktop; pairing again:', error)
  }
  // Revision matching joins already-completed repairs instead of repeating host work.
  const repaired = await recovery.repairs.repair(environmentId, pairingRevisionOf(refused))
  try {
    await recovery.ensure(repaired)
  } catch (error) {
    throw error instanceof DolphindManagedPairingRejectedError
      ? recovery.repairs.recordRefusedAfterRepair(environmentId, pairingRevisionOf(repaired), epoch)
      : error
  }
  return 'repaired'
}
