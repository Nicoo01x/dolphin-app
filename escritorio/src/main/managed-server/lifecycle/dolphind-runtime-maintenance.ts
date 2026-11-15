import { getAppEnvironment } from '../../../shared/app-environment'
import { redactRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type {
  DolphindManagedDeployResult,
  DolphindManagedPastLiveTerminals
} from '../../../shared/dolphind-managed-runtime'

import { materializeDolphindArtifact } from '../../dolphind/dolphind-artifact-materializer'
import { wakeAlreadyActiveDolphind } from './dolphind-already-active-wake'
import {
  clearManagedDolphindUpdateDeferral,
  recordManagedDolphindUpdateDeferral
} from './dolphind-managed-update-deferrals'

import {
  isForceableDolphindDeferral,
  managedDolphindSlot,
  probeManagedDolphindReadiness,
  resolveLinkedDolphindContext
} from './dolphind-managed-runtime-context'

import type { requireManagedDolphindEnvironment } from './dolphind-managed-runtime-context'

import type { DolphindRemoteContext } from '../install/dolphind-remote-context'
import { deployDolphind } from '../install/dolphind-remote-deploy'
import type { DolphindDeployOptions } from '../install/dolphind-remote-deploy'
import type { DolphindUpdateForce } from '../activation/dolphind-update-plan'
import { DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE } from '../activation/dolphind-installed-activation'
import {
  pruneManagedDolphindVersions,
  pruneSupersededDolphindCandidates
} from './dolphind-managed-version-gc'

import { clearDolphindUpdateFailedThisLaunch } from './dolphind-managed-update-failure-memory'
import { admitDolphindRecordForIntent } from './dolphind-managed-update-decision'
import { collectManagedTerminalCensus } from './dolphind-terminal-census-client'
import { updateTerminalCounts } from '../activation/dolphind-fenced-stop'
import { refreshMaintainedDolphindPairing } from './dolphind-maintenance-pairing-refresh'
import type { LifecycleArgs } from './dolphind-managed-lifecycle'
import { withManagedDolphindLifecycle, followLaunchedServerPort } from './dolphind-managed-lifecycle'

export function updateManagedDolphindEnvironment(
  userDataPath: string,
  args: LifecycleArgs & { force?: boolean; pastLiveTerminals?: DolphindManagedPastLiveTerminals }
): Promise<DolphindManagedDeployResult> {
  const { pastLiveTerminals } = args
  // Update anyway keeps Update's version admission even if a caller also passed force.
  const intent = args.force && !pastLiveTerminals ? 'force' : 'update'
  return withManagedDolphindLifecycle(userDataPath, args.selector, async (managed) => {
    const admitIntent = admitDolphindRecordForIntent(intent, getAppEnvironment().getVersion())
    // Checked under the host fence: another desktop may have activated a build since the confirm.
    const admitRecord: NonNullable<DolphindDeployOptions['admitRecord']> = pastLiveTerminals
      ? (record, candidateVersion) =>
          record.active !== pastLiveTerminals.incumbentVersion
            ? "This host's server changed since the update was confirmed. Review it and update again."
            : admitIntent(record, candidateVersion)
      : admitIntent
    const force: DolphindUpdateForce | undefined = pastLiveTerminals ? 'live-terminals' : args.force
    const result = await runManagedDolphindUpdate(
      userDataPath,
      managed,
      await resolveLinkedDolphindContext(managed.environment, managed.deployment, args.signal),
      { signal: args.signal, force, admitRecord }
    )
    // A completed manual update clears automatic failure suppression; deferred attempts do not.
    if (result.outcome !== 'deferred') {
      clearDolphindUpdateFailedThisLaunch({ kind: 'ssh', id: managed.deployment.sshTargetId })
    }
    return result
  })
}

export async function runManagedDolphindUpdate(
  userDataPath: string,
  { environment, deployment }: ReturnType<typeof requireManagedDolphindEnvironment>,
  context: DolphindRemoteContext,
  args: {
    force?: DolphindUpdateForce
    signal?: AbortSignal
    localDolphindDir?: string
    admitRecord?: DolphindDeployOptions['admitRecord']
  }
): Promise<DolphindManagedDeployResult> {
  const { countFirst, ...recount } = updateTerminalCounts((options) =>
    collectManagedTerminalCensus(
      userDataPath,
      environment,
      context.activationRecord,
      undefined,
      options
    )
  )
  const census = await countFirst()
  const localDolphindDir =
    args.localDolphindDir ??
    (await materializeDolphindArtifact(context.serverTarget, { signal: args.signal }))
  const slot = managedDolphindSlot(context, deployment.remotePort, args.signal)
  const result = await deployDolphind({
    ...slot,
    localDolphindDir,
    target: context.serverTarget,
    census,
    ...recount,
    censusRecord: context.activationRecord,
    force: args.force,
    appVersion: getAppEnvironment().getVersion(),
    ...(args.admitRecord ? { admitRecord: args.admitRecord } : {})
  })
  if (result.outcome === 'installed-not-activated') {
    const deferral = {
      outcome: 'deferred' as const,
      candidateVersion: result.fullVersion,
      code: result.code,
      reason: result.reason,
      // Force may override policy deferrals, including a newer host build.
      forceable:
        isForceableDolphindDeferral(result.code) ||
        result.code === DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE
    }
    // Policy refusal is final for this host, not a transient update to retry.
    if (result.code !== DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE) {
      recordManagedDolphindUpdateDeferral(environment.id, deferral, context.activationRecord)
    }
    await pruneSupersededDolphindCandidates(slot, context.serverTarget, result.fullVersion)
    return deferral
  }
  clearManagedDolphindUpdateDeferral(environment.id)
  const alreadyActive = result.outcome === 'already-active'
  const managed = { environmentId: environment.id, hostLabel: context.target.label }
  const started = alreadyActive && (await wakeAlreadyActiveDolphind(slot, managed))
  const readiness = await probeManagedDolphindReadiness(
    context,
    localDolphindDir,
    result.fullVersion,
    args.signal
  )
  await pruneManagedDolphindVersions({
    slot,
    serverTarget: context.serverTarget,
    activeVersion: result.fullVersion,
    readiness
  })
  const updated = refreshMaintainedDolphindPairing(userDataPath, environment.id, readiness)
  if (started || result.outcome !== 'already-active') {
    await followLaunchedServerPort(userDataPath, environment.id)
  }
  return {
    outcome: result.outcome === 'already-active' ? 'already-current' : 'updated',
    environment: redactRuntimeEnvironment(updated),
    activeVersion: result.fullVersion
  }
}
