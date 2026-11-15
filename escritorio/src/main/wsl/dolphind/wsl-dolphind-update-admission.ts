/** Reuse SSH update admission: keep newer, rolled-back or launch-rejected incumbents serving; fenced activation replans before committing. */
import {
  DOLPHIND_HOST_NEWER_DEFERRAL_CODE,
  DOLPHIND_UPDATE_WSL_MOVE_RUNNING_CODE,
  type WslHostDeferredUpdate
} from '../../../shared/wsl-host-types'
import { refuseDolphindHostDowngrade } from '../../managed-server/activation/dolphind-host-version-admission'
import type { ServeReadiness } from '../../server/serve-readiness'
import type { DolphindActivationRecord } from '../../managed-server/activation/dolphind-activation-record'
import { readDolphindActivationRecord } from '../../managed-server/activation/dolphind-activation-record-store'
import { readDolphindActivationTransaction } from '../../managed-server/activation/dolphind-activation-transaction-store'
import { isWaitingDolphindUpdateDeferral } from '../../managed-server/lifecycle/dolphind-managed-auto-update'
import {
  dolphindUpdateSkipRefusal,
  planDolphindUpdateForIntent,
  type ManagedDolphindAutoUpdatePlan,
  type DolphindUpdateIntent
} from '../../managed-server/lifecycle/dolphind-managed-update-decision'
import {
  dolphindUpdateFailureThisLaunch,
  recordDolphindUpdateFailedThisLaunch,
  type DolphindUpdateFailure,
  type DolphindUpdateFailureHost
} from '../../managed-server/lifecycle/dolphind-managed-update-failure-memory'
import { DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE } from '../../managed-server/activation/dolphind-installed-activation'
import type { DolphindSlotOptions } from '../../managed-server/activation/dolphind-recovery-slot'
import { adoptRunningDolphindVersion } from '../../managed-server/activation/dolphind-running-version-adoption'
import type { WslDolphindLaunch } from './wsl-dolphind-launch-contract'

type WslDolphindReadyLaunch = Extract<WslDolphindLaunch, { outcome: 'ready' }>

export type WslDolphindUpdateAdmission =
  | {
      action: 'serve'
      version: string
      readiness: ServeReadiness
      deferredUpdate: WslHostDeferredUpdate | null
    }
  /** Another run holds the host fence; a later connect adopts or deploys. */
  | { action: 'defer'; deferredUpdate: WslHostDeferredUpdate }
  /** Deploy this app's build on this record. */
  | { action: 'deploy'; record: DolphindActivationRecord }

export async function admitWslDolphindUpdate(args: {
  slot: DolphindSlotOptions
  record: DolphindActivationRecord
  candidateVersion: string
  appVersion: string
  host: DolphindUpdateFailureHost
  intent: DolphindUpdateIntent
  /** A project move to this distro runs here: a redeploy would cut it off, even when forced. */
  moveRunning?: boolean
}): Promise<WslDolphindUpdateAdmission> {
  const { record, candidateVersion, appVersion } = args
  if (!record.active) {
    return { action: 'deploy', record }
  }
  const failure = dolphindUpdateFailureThisLaunch(args.host)
  const plan = planDolphindUpdateForIntent(args.intent, {
    record,
    candidateVersion,
    appVersion,
    failedBefore: failure !== null
  })
  const heldForMove = args.moveRunning === true && plan.action === 'update'
  if (!heldForMove && (plan.action !== 'skip' || plan.reason === 'current')) {
    return { action: 'deploy', record }
  }
  const adopted = await adoptRunningDolphindVersion(args.slot, record, candidateVersion)
  if (!adopted) {
    // Nothing active any more: deploy on the record the wake read; its fenced admission re-plans.
    return { action: 'deploy', record: await readDolphindActivationRecord(args.slot) }
  }
  if ('outcome' in adopted) {
    const { candidateVersion: version, code, reason, forceable } = adopted
    return {
      action: 'defer',
      deferredUpdate: { candidateVersion: version, code, reason, forceable: forceable === true }
    }
  }
  return {
    action: 'serve',
    version: adopted.version,
    readiness: adopted.readiness,
    deferredUpdate:
      adopted.version === candidateVersion
        ? null
        : heldForMove
          ? {
              candidateVersion,
              code: DOLPHIND_UPDATE_WSL_MOVE_RUNNING_CODE,
              reason:
                'A project is moving to this WSL host; its server updates once the move finishes.',
              forceable: false
            }
          : skippedUpdateHint(plan, failure, record, candidateVersion, appVersion)
  }
}

/** The launch an admission ends in, or the record to deploy on. */
export async function admitWslDolphindLaunch(
  args: Parameters<typeof admitWslDolphindUpdate>[0],
  distro: string,
  readyLaunch: (serving: {
    fullVersion: string
    readiness: ServeReadiness
  }) => Promise<WslDolphindReadyLaunch>
): Promise<WslDolphindLaunch | DolphindActivationRecord> {
  const admission = await admitWslDolphindUpdate(args)
  if (admission.action === 'deploy') {
    return admission.record
  }
  if (admission.action === 'defer') {
    return { outcome: 'deferred', distro, ...admission.deferredUpdate }
  }
  const ready = await readyLaunch({
    fullVersion: admission.version,
    readiness: admission.readiness
  })
  return admission.deferredUpdate ? { ...ready, deferredUpdate: admission.deferredUpdate } : ready
}

/** Offer Update/Force for retriable host deferrals; newer hosts get no hint because Update cannot change that refusal. */
function skippedUpdateHint(
  plan: ManagedDolphindAutoUpdatePlan,
  failure: DolphindUpdateFailure | null,
  record: DolphindActivationRecord,
  candidateVersion: string,
  appVersion: string
): WslHostDeferredUpdate | null {
  if (plan.action !== 'skip') {
    return null
  }
  if (plan.reason === 'failed-before' && failure) {
    return { candidateVersion, ...failure, forceable: true }
  }
  const refusal =
    plan.reason === 'rolled-back'
      ? dolphindUpdateSkipRefusal(plan, record, candidateVersion, appVersion)
      : null
  return refusal
    ? {
        candidateVersion,
        code: DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE,
        reason: refusal,
        forceable: true
      }
    : null
}

/** Do not retry rejected/thrown incumbent updates this launch, matching SSH. Waits/policy refusals never attempted activation and record no failure. */
export function recordWslDolphindUpdateFailure(
  host: DolphindUpdateFailureHost,
  incumbentVersion: string | null,
  failure: DolphindUpdateFailure | null
): void {
  if (incumbentVersion && failure) {
    recordDolphindUpdateFailedThisLaunch(host, failure)
  }
}

export function wslDolphindDeferralFailure(deployed: {
  code: string
  reason: string
}): DolphindUpdateFailure | null {
  return isWaitingDolphindUpdateDeferral(deployed.code) ||
    deployed.code === DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE
    ? null
    : { code: deployed.code, reason: deployed.reason }
}

/** A policy refusal over a host a newer Dolphin runs gets its own code: an Update cannot pass it. */
export async function wslDolphindDeferralCode(
  slot: DolphindSlotOptions,
  deployed: { code: string; fullVersion: string },
  appVersion: string
): Promise<string> {
  if (deployed.code !== DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE) {
    return deployed.code
  }
  const record = await readDolphindActivationRecord(slot).catch(() => null)
  return record && refuseDolphindHostDowngrade(record, deployed.fullVersion, appVersion)
    ? DOLPHIND_HOST_NEWER_DEFERRAL_CODE
    : deployed.code
}

/** The record only once the incumbent is back and no journal awaits recovery; else null. */
export async function readRestoredWslDolphindRecord(
  slot: DolphindSlotOptions,
  incumbent: string
): Promise<DolphindActivationRecord | null> {
  // Unreadable transaction state proves no restoration; preserve the rejection.
  if (await readDolphindActivationTransaction(slot).catch(() => true)) {
    return null
  }
  const record = await readDolphindActivationRecord(slot).catch(() => null)
  return record?.active === incumbent ? record : null
}
