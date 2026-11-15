// Target claims preserve environment identity so interrupted deploys resume the same registration.
import { getAppEnvironment } from '../../../shared/app-environment'
import { randomUUID } from 'node:crypto'
import { assertRuntimeEnvironmentNotReconciling } from '../../../shared/remote-runtime/host-catalog/runtime-environment-reconciliation-record'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { addManagedDolphindEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-managed-dolphind-store'
import {
  getDolphindSshDeployment,
  redactRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  DOLPHIND_MANAGED_REMOTE_PORT,
  type DolphindManagedDeferral,
  type DolphindManagedDeployResult
} from '../../../shared/dolphind-managed-runtime'
import { getManagedDolphindFenceEnvironmentId } from '../../../shared/managed-dolphind-ssh-owner'
import { runTargetLifecycle } from '../../ipc/ssh/ssh-target-lifecycle-queue'
import { materializeDolphindArtifact } from '../../dolphind/dolphind-artifact-materializer'
import {
  closeDolphindManagedTunnel,
  ensureDolphindManagedTunnel,
  startDolphindManagedTunnel
} from './dolphind-managed-tunnel'
import { recoverInterruptedDolphindActivation } from '../activation/dolphind-activation-recovery'
import { wakeAlreadyActiveDolphind } from './dolphind-already-active-wake'
import { readDolphindActivationRecord } from '../activation/dolphind-activation-record-store'
import { resolveDolphindRemoteContext, type DolphindRemoteContext } from '../install/dolphind-remote-context'
import { deployDolphind } from '../install/dolphind-remote-deploy'
import {
  adoptRunningDolphindVersion,
  type DolphindRunningAdoption
} from '../activation/dolphind-running-version-adoption'
import { readLocalFullVersion } from '../install/remote-versioned-install'

import { DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE } from '../activation/dolphind-installed-activation'
import { pruneManagedDolphindVersions } from './dolphind-managed-version-gc'
import { tunneledDolphindPairingCode } from './dolphind-tunneled-pairing'
import { resolveDolphindMigrationFence } from '../../ssh/migration-source/dolphind-migration-source-fence'
import type { SshTarget } from '../../../shared/ssh-types'
import { findCollidingEnvironmentName } from '../../../shared/remote-runtime/host-catalog/runtime-environment-name-collision'
import { deployedDolphindTunnelChecks } from './dolphind-managed-tunnel-identity'
import {
  isForceableDolphindDeferral,
  managedDolphindDeployPolicy,
  managedDolphindSlot,
  probeManagedDolphindReadiness,
  requireManagedDolphindInfrastructure
} from './dolphind-managed-runtime-context'

export async function createManagedDolphindEnvironment(
  userDataPath: string,
  args: {
    name: string
    sshTargetId: string
    force?: boolean
    signal?: AbortSignal
    migration?: boolean
  }
): Promise<DolphindManagedDeployResult> {
  return runTargetLifecycle(args.sshTargetId, async () => {
    const { connectionManager, targetStore, claims } = requireManagedDolphindInfrastructure()
    const environmentId =
      getManagedDolphindFenceEnvironmentId(targetStore.getTarget(args.sshTargetId)) ?? randomUUID()
    // Duplicate/name checks before an add: a crash-zeroed list (#18766) must read as empty here.
    const environments = listEnvironments(userDataPath, { recoverBlankStore: true })
    const registered = environments.find((entry) => entry.id === environmentId)
    if (registered) {
      assertRuntimeEnvironmentNotReconciling(registered)
      if (getDolphindSshDeployment(registered)?.sshTargetId !== args.sshTargetId) {
        throw new Error('The SSH target is owned by a server that is not deployed on it.')
      }
    }
    const namesake = findCollidingEnvironmentName(
      environments.filter((entry) => entry.id !== environmentId),
      args.name
    )
    if (namesake) {
      throw new Error(`A server named "${namesake.name}" already exists.`)
    }
    const current = targetStore.getTarget(args.sshTargetId)
    if (args.migration) {
      assertMigrationFence(userDataPath, current, environmentId, args.name)
    }
    const claimed = claims.claim(args.sshTargetId, environmentId, {
      ...(args.migration ? {} : { deployName: args.name }),
      ownerRecorded:
        Boolean(args.migration) || Boolean(current?.dolphindProvisioning) || Boolean(registered)
    })
    await claims.flush(args.signal)
    const targetGeneration = claimed.generation
    if (targetGeneration === undefined) {
      throw new Error(
        'The SSH registration for this host’s Dolphin server has no durable generation.'
      )
    }
    if (
      registered &&
      getDolphindSshDeployment(registered)?.sshTargetGeneration !== targetGeneration
    ) {
      throw new Error('The saved Dolphin server for this host has a stale SSH target generation.')
    }
    let environmentRegistered = false
    try {
      const connection = await connectionManager.connect(claimed)
      let context = await resolveDolphindRemoteContext(claimed, connection, args.signal)
      const slot = managedDolphindSlot(context, DOLPHIND_MANAGED_REMOTE_PORT, args.signal)
      const recovery = await recoverInterruptedDolphindActivation(slot)
      if (recovery.outcome === 'pending' || recovery.outcome === 'refused') {
        throw new Error(recovery.reason)
      }
      if (recovery.outcome === 'recovered') {
        context = { ...context, activationRecord: await readDolphindActivationRecord(slot) }
      }
      if (registered) {
        environmentRegistered = true
        const current = await ensureDolphindManagedTunnel(userDataPath, registered.id)
        const activeVersion = context.activationRecord.active
        if (!activeVersion) {
          throw new Error('This host’s Dolphin server has no active runtime version.')
        }
        return {
          outcome: 'already-current',
          environment: redactRuntimeEnvironment(current),
          activeVersion
        }
      }
      const localDolphindDir = await materializeDolphindArtifact(context.serverTarget, {
        signal: args.signal
      })
      // Adopt before upload: only the paired incumbent can count terminals; redeploy would defer.
      const localVersion = readLocalFullVersion(localDolphindDir)
      const adopted = args.force
        ? null
        : await adoptRunningDolphindVersion(slot, context.activationRecord, localVersion)
      const { active } = context.activationRecord
      if (!adopted && !args.force && active && active !== localVersion) {
        // Wake may observe a peer's changed record; census admission must use that same record.
        context = { ...context, activationRecord: await readDolphindActivationRecord(slot) }
      }
      const serving: DeployedDolphind | DolphindManagedDeferral =
        adopted ??
        (await deployOwnDolphind(context, { ...slot, conn: connection }, localDolphindDir, args))
      if ('outcome' in serving) {
        return serving
      }
      // Read the bound port: the preferred port may belong to another host process.
      const tunnel = deployedDolphindTunnelChecks(serving.readiness, serving.reprobe)
      const localPort = await startDolphindManagedTunnel(
        environmentId,
        claimed,
        connection,
        tunnel.remotePort,
        { ...tunnel, preferredPort: DOLPHIND_MANAGED_REMOTE_PORT }
      )
      const environment = addManagedDolphindEnvironment(userDataPath, {
        id: environmentId,
        name: args.name,
        pairingCode: tunneledDolphindPairingCode(tunnel.readiness(), localPort),
        dolphindDeployment: {
          sshTargetId: claimed.id,
          sshTargetGeneration: targetGeneration,
          localPort,
          remotePort: DOLPHIND_MANAGED_REMOTE_PORT
        }
      })
      environmentRegistered = true
      return {
        outcome: serving.created ? 'created' : 'already-current',
        environment: redactRuntimeEnvironment(environment),
        activeVersion: serving.version
      }
    } finally {
      if (!environmentRegistered) {
        await closeDolphindManagedTunnel(environmentId).catch(() => undefined)
      }
    }
  })
}

type DeployedDolphind = DolphindRunningAdoption & { created?: true }

async function deployOwnDolphind(
  context: DolphindRemoteContext<SshTarget>,
  slot: ReturnType<typeof managedDolphindSlot>,
  localDolphindDir: string,
  args: { force?: boolean; signal?: AbortSignal }
): Promise<DeployedDolphind | DolphindManagedDeferral> {
  const appVersion = getAppEnvironment().getVersion()
  const deployResult = await deployDolphind({
    ...slot,
    localDolphindDir,
    target: context.serverTarget,
    ...managedDolphindDeployPolicy(context, appVersion, args.force ? 'force' : 'connect'),
    force: args.force,
    appVersion
  })
  if (deployResult.outcome === 'installed-not-activated') {
    return {
      outcome: 'deferred',
      candidateVersion: deployResult.fullVersion,
      code: deployResult.code,
      reason: deployResult.reason,
      forceable:
        isForceableDolphindDeferral(deployResult.code) ||
        deployResult.code === DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE
    }
  }
  if (deployResult.outcome === 'already-active') {
    await wakeAlreadyActiveDolphind(slot)
  }
  const reprobe = () =>
    probeManagedDolphindReadiness(context, localDolphindDir, deployResult.fullVersion, args.signal)
  const readiness = await reprobe()
  await pruneManagedDolphindVersions({
    slot,
    serverTarget: context.serverTarget,
    activeVersion: deployResult.fullVersion,
    readiness
  })
  return {
    version: deployResult.fullVersion,
    readiness,
    reprobe,
    ...(deployResult.outcome === 'already-active' ? {} : { created: true as const })
  }
}

function assertMigrationFence(
  userDataPath: string,
  target: SshTarget | undefined,
  environmentId: string,
  name: string
): void {
  const fence = target ? resolveDolphindMigrationFence(userDataPath, target) : null
  if (
    fence?.state !== 'fenced' ||
    fence.cutover.destinationEnvironmentId !== environmentId ||
    fence.cutover.destinationName !== name
  ) {
    throw new Error('dolphind_migration_fence_required')
  }
}
