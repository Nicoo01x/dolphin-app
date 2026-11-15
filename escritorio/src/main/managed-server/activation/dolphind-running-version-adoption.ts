/** Pair with an already-running foreign build before considering update; an unpaired first deploy cannot census its terminals. */
import type { ServeReadiness } from '../../server/serve-readiness'
import type { DolphindManagedDeferral } from '../../../shared/dolphind-managed-runtime'
import { dolphindActivationFenceRefusal } from './dolphind-activation-fence-hold'
import { DolphindActiveReadinessError, probeActiveDolphindReadiness } from './dolphind-active-readiness'
import type { DolphindActivationRecord } from './dolphind-activation-record'
import { readDolphindActivationRecord } from './dolphind-activation-record-store'
import { wakeStoppedManagedDolphind } from '../lifecycle/dolphind-managed-wake'
import { resolveDolphindSlotIdentity, type DolphindSlotOptions } from './dolphind-recovery-slot'

export type DolphindRunningAdoption = {
  version: string
  readiness: ServeReadiness
  /** Reads the adopted slot's readiness again, e.g. after it rebinds its port. */
  reprobe: () => Promise<ServeReadiness>
}

/** No foreign activation returns null for normal deploy. A held peer fence defers: deploying without pairing would only fail census (#28833). */
export async function adoptRunningDolphindVersion(
  slot: DolphindSlotOptions,
  record: DolphindActivationRecord,
  localVersion: string,
  retryClearedFence = true
): Promise<DolphindRunningAdoption | DolphindManagedDeferral | null> {
  if (!record.active || record.active === localVersion) {
    return null
  }
  // Wake only on proven server exit; idle stops leave daemon terminals alive.
  const wake = await wakeStoppedManagedDolphind(slot)
  switch (wake.outcome) {
    // Another desktop stopped it meanwhile; the deploy's own gates decide.
    case 'not-activated':
      return null
    case 'fenced': {
      // E.g. another desktop starting it after a reboot; a later connect pairs with it.
      const { cleared, ...refusal } = await dolphindActivationFenceRefusal(slot, 'server start')
      if (cleared && retryClearedFence) {
        return adoptRunningDolphindVersion(slot, record, localVersion, false)
      }
      return { outcome: 'deferred', candidateVersion: localVersion, ...refusal, forceable: false }
    }
    case 'unverifiable':
      throw new DolphindActiveReadinessError(
        'unverifiable',
        `Dolphin ${record.active} runs this host's server, but its process state is unverifiable, ` +
          'so it was left as it is. Try connecting again.'
      )
    case 'recovery-refused':
      throw new Error(wake.reason)
    case 'serving':
    case 'started':
      break
  }
  // Re-read activation because wake follows peer changes to the current record.
  const active = (await readDolphindActivationRecord(slot)).active
  if (!active || active === localVersion) {
    return null
  }
  const identity = await resolveDolphindSlotIdentity(slot, active)
  const reprobe = () =>
    probeActiveDolphindReadiness(
      { ...slot, remoteInstallDir: identity.remoteDir },
      { buildHash: identity.buildHash, fullVersion: identity.version }
    )
  return { version: active, readiness: await reprobe(), reprobe }
}
