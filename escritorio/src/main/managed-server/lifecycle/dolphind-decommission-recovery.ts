import { writeDolphindActivationRecord } from '../activation/dolphind-activation-record-store'
import type { DolphindActivationRecoveryResult } from '../activation/dolphind-activation-recovery'
import type { DolphindDecommissionRecoveryPlan } from './dolphind-decommission-transaction'
import { settleDolphindDecommissionStop } from './dolphind-decommission-stop'
import {
  dolphindLivenessProbeCommand,
  dolphindLivenessProvenExited,
  parseDolphindLiveness
} from '../install/dolphind-remote-launch'
import { execDolphindRemote } from '../install/dolphind-remote-runtime-control'
import {
  ensureDolphindSlotServing,
  dolphindSlotDir,
  resolveDolphindSlotIdentity,
  type DolphindSlotOptions
} from '../activation/dolphind-recovery-slot'

/** Only proven exit clears an interrupted decommission journal. */
export async function reconcileDolphindDecommission(
  options: DolphindSlotOptions,
  plan: DolphindDecommissionRecoveryPlan
): Promise<DolphindActivationRecoveryResult> {
  if (plan.action === 'keep-serving') {
    const identity = await resolveDolphindSlotIdentity(options, plan.version)
    return {
      outcome: 'recovered',
      resolution: 'restored-incumbent',
      activeVersion: plan.version,
      readiness: await ensureDolphindSlotServing(options, identity)
    }
  }
  if (plan.action === 'resume-stop') {
    const settlement = await settleDolphindDecommissionStop(options, plan.request)
    if (settlement.state === 'unsettled') {
      return {
        outcome: 'refused',
        verdict: settlement.verdict,
        code: 'dolphind_recovery_decommission_unsettled',
        reason: settlement.reason
      }
    }
    if (settlement.state === 'withdrawn') {
      return reconcileDolphindDecommission(options, {
        action: 'keep-serving',
        version: plan.request.version
      })
    }
    return reconcileDolphindDecommission(options, {
      action: 'confirm-decommissioned',
      version: plan.request.version,
      record: plan.record
    })
  }
  // Live or unanswered slots retain the fence; only proven exit permits commit.
  const liveness = parseDolphindLiveness(
    await execDolphindRemote(
      options,
      dolphindLivenessProbeCommand(options.host, dolphindSlotDir(options, plan.version))
    )
  )
  if (!dolphindLivenessProvenExited(liveness)) {
    return {
      outcome: 'refused',
      verdict: liveness === 'LIVE' ? 'live' : 'unverifiable',
      code: 'dolphind_recovery_decommissioned_slot_not_exited',
      reason: `dolphind ${plan.version} is recorded as stopped but is ${liveness.toLowerCase()}.`
    }
  }
  if (plan.record) {
    await writeDolphindActivationRecord(options, plan.record)
  }
  return { outcome: 'recovered', resolution: 'committed', activeVersion: null, readiness: null }
}
