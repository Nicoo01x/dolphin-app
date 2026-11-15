import type { DolphindManagedDeferral } from '../../../shared/dolphind-managed-runtime'
import type { DolphindActivationRecord } from '../activation/dolphind-activation-record'

type RecordedDeferral = DolphindManagedDeferral & { deferredAt: string }

/** Which activation a host is on: a version alone repeats when a host moves away and back. */
export type DolphindIncumbent = Pick<DolphindActivationRecord, 'active' | 'activatedAt'>

type StoredDeferral = RecordedDeferral & {
  /** The host's activation when the deferral was recorded. */
  incumbentAtDeferral: DolphindIncumbent
}

const deferrals = new Map<string, StoredDeferral>()

export function recordManagedDolphindUpdateDeferral(
  environmentId: string,
  deferral: DolphindManagedDeferral,
  incumbent: DolphindIncumbent,
  now = new Date()
): void {
  deferrals.set(environmentId, {
    ...deferral,
    deferredAt: now.toISOString(),
    incumbentAtDeferral: { active: incumbent.active, activatedAt: incumbent.activatedAt }
  })
}

export function clearManagedDolphindUpdateDeferral(environmentId: string): void {
  deferrals.delete(environmentId)
}

/** Forget a deferral once the host's activation moves, since it described a host state that is gone
 *  (builds of one release differ only by an unorderable content hash, #38400), or once its candidate
 *  is the build the host runs, since nothing is left to update. */
export function currentManagedDolphindUpdateDeferral(
  environmentId: string,
  incumbent: DolphindIncumbent
): RecordedDeferral | null {
  const stored = deferrals.get(environmentId)
  if (!stored) {
    return null
  }
  const { incumbentAtDeferral, ...deferral } = stored
  if (
    incumbent.active === deferral.candidateVersion ||
    incumbentAtDeferral.active !== incumbent.active ||
    incumbentAtDeferral.activatedAt !== incumbent.activatedAt
  ) {
    clearManagedDolphindUpdateDeferral(environmentId)
    return null
  }
  return deferral
}
