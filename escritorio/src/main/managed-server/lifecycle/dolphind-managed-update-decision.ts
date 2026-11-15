import { compareAppVersions, isValidAppVersion } from '../../../shared/app-version'
import type { DolphindActivationRecord } from '../activation/dolphind-activation-record'
import {
  refuseDolphindHostDowngrade,
  type DolphindHostVersionRefusal
} from '../activation/dolphind-host-version-admission'

export type ManagedDolphindAutoUpdateSkip =
  | 'current'
  | 'no-template'
  | 'rolled-back'
  | 'failed-before'
  | 'migrating'
  | DolphindHostVersionRefusal

/** Connect honors all skips; Update retries local failures/rollbacks; Force also lifts version skips. */
export type DolphindUpdateIntent = 'connect' | 'update' | 'force'

export type ManagedDolphindAutoUpdatePlan =
  | { action: 'update' }
  | { action: 'skip'; reason: ManagedDolphindAutoUpdateSkip }

export function planManagedDolphindAutoUpdate(input: {
  record: DolphindActivationRecord
  candidateVersion: string | null
  appVersion: string
  failedBefore: boolean
}): ManagedDolphindAutoUpdatePlan {
  const { record, candidateVersion } = input
  if (!candidateVersion) {
    return { action: 'skip', reason: 'no-template' }
  }
  if (record.active === candidateVersion) {
    return { action: 'skip', reason: 'current' }
  }
  if (record.rolledBackFrom === candidateVersion) {
    return { action: 'skip', reason: 'rolled-back' }
  }
  const refusal = refuseDolphindHostDowngrade(record, candidateVersion, input.appVersion)
  if (refusal) {
    return { action: 'skip', reason: refusal }
  }
  // A stopped host has no serving fallback; retry even after a prior failed attempt.
  if (record.active === null && record.previous !== null) {
    return { action: 'update' }
  }
  return input.failedBefore ? { action: 'skip', reason: 'failed-before' } : { action: 'update' }
}

export function planDolphindUpdateForIntent(
  intent: DolphindUpdateIntent,
  input: Parameters<typeof planManagedDolphindAutoUpdate>[0]
): ManagedDolphindAutoUpdatePlan {
  if (intent === 'force') {
    return { action: 'update' }
  }
  if (intent === 'connect') {
    return planManagedDolphindAutoUpdate(input)
  }
  const { rolledBackFrom: _retried, ...record } = input.record
  return planManagedDolphindAutoUpdate({ ...input, record, failedBefore: false })
}

export function admitDolphindRecordForIntent(
  intent: DolphindUpdateIntent,
  appVersion: string
): (record: DolphindActivationRecord, candidateVersion: string) => string | null {
  return (record, candidateVersion) =>
    dolphindUpdateSkipRefusal(
      planDolphindUpdateForIntent(intent, {
        record,
        candidateVersion,
        appVersion,
        failedBefore: false
      }),
      record,
      candidateVersion,
      appVersion
    )
}

export function dolphindUpdateSkipRefusal(
  plan: ManagedDolphindAutoUpdatePlan,
  record: DolphindActivationRecord,
  candidateVersion: string,
  appVersion: string
): string | null {
  if (plan.action !== 'skip' || plan.reason === 'current') {
    return null
  }
  return plan.reason === 'rolled-back'
    ? `This host's server rolled back from ${candidateVersion}, so a connect does not activate ` +
        'it again; choose Update or Force to retry it.'
    : `Dolphin ${record.activeAppVersion} last ran this host's server, newer than this ` +
        `Dolphin (${appVersion}). Update Dolphin to start it.`
}

/** Content hashes cannot order updates: compare Dolphin versions, or for legacy hosts offer only this desktop's previously deferred build. */
export function availableManagedDolphindUpdate(input: {
  record: DolphindActivationRecord
  candidateVersion: string | null
  appVersion: string
  /** The build this desktop's last Update or connect deferred on this host. */
  deferredCandidateVersion: string | null
}): string | null {
  const { record, candidateVersion, appVersion } = input
  const hostAppVersion = record.activeAppVersion
  if (!candidateVersion || record.active === null || !isValidAppVersion(appVersion)) {
    return null
  }
  const ordered = hostAppVersion
    ? isValidAppVersion(hostAppVersion) && compareAppVersions(appVersion, hostAppVersion) >= 0
    : input.deferredCandidateVersion === candidateVersion
  if (!ordered) {
    return null
  }
  // Connect rules: a build the user rolled back from is not advertised again.
  const plan = planManagedDolphindAutoUpdate({
    record,
    candidateVersion,
    appVersion,
    failedBefore: false
  })
  return plan.action === 'update' ? candidateVersion : null
}
