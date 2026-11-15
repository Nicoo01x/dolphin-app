import type { WslHostDeferredUpdate } from '../../../shared/wsl-host-types'
import type { WslDolphindLaunch, WslDolphindDeployOptions } from './wsl-dolphind-launch-contract'
/** D1/D2b/D8 reuse SSH installation, activation journals/fences and admission over wsl.exe. C5 pairs through the reported loopback port. */
import { getAppEnvironment } from '../../../shared/app-environment'

import { DOLPHIND_MANAGED_REMOTE_PORT } from '../../../shared/dolphind-managed-runtime'
import type { ServeReadiness } from '../../server/serve-readiness'

import { recoverInterruptedDolphindActivation } from '../../managed-server/activation/dolphind-activation-recovery'
import { readDolphindActivationRecord } from '../../managed-server/activation/dolphind-activation-record-store'
import { materializeDolphindArtifact } from '../../dolphind/dolphind-artifact-materializer'
import type { DolphindHostTransport } from '../../managed-server/install/dolphind-host-transport'
import { DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE } from '../../managed-server/activation/dolphind-installed-activation'
import { dolphindBoundPort } from '../../managed-server/lifecycle/dolphind-managed-bound-port'
import {
  isForceableDolphindDeferral,
  managedDolphindDeployPolicy,
  managedDolphindSlot
} from '../../managed-server/lifecycle/dolphind-managed-runtime-context'
import { isWaitingDolphindUpdateDeferral } from '../../managed-server/lifecycle/dolphind-managed-auto-update'
import { clearDolphindUpdateFailedThisLaunch } from '../../managed-server/lifecycle/dolphind-managed-update-failure-memory'
import type { DolphindUpdateIntent } from '../../managed-server/lifecycle/dolphind-managed-update-decision'
import type { DolphindActivationRecord } from '../../managed-server/activation/dolphind-activation-record'
import { errorMessage } from '../../../shared/error-message'
import { pruneWslDolphindVersionsUntilClean } from './wsl-dolphind-version-gc-memo'
import { pruneSupersededDolphindCandidates } from '../../managed-server/lifecycle/dolphind-managed-version-gc'
import { wakeAlreadyActiveDolphind } from '../../managed-server/lifecycle/dolphind-already-active-wake'
import { DolphindActiveReadinessError } from '../../managed-server/activation/dolphind-active-readiness'
import { WslDistroNotRunningError } from './wsl-dolphind-connection-errors'
import {
  deployDolphind,
  type DolphindDeployOptions
} from '../../managed-server/install/dolphind-remote-deploy'
import { isWslMoveUnderwayOnHost } from '../../persistence/moving-wsl-projects/wsl-move-running-moves'
import { readLocalFullVersion } from '../../managed-server/install/remote-versioned-install'
import { createWslDistroHolder } from '../discovery/wsl-distro-holder'

import { wslDistroHolderKey } from '../discovery/wsl-distro-holder-record'
import { readWslDistroRegistryIdShared } from '../discovery/wsl-distro-registry-id'
import type { WslDolphindHostTarget } from './wsl-dolphind-host-target'
import { createWslDolphindHostTransport, type WslDolphindHostTransport } from './wsl-dolphind-host-transport'
import { holdWslDistroWithContext } from './wsl-dolphind-held-context'
import { deployWslDolphindWithOneFence } from './wsl-dolphind-one-fence-deploy'
import { removeFailedFreshWslDolphindInstall } from './wsl-dolphind-failed-install-removal'
import { probeWslActiveDolphind, readWslDolphindPid } from './wsl-dolphind-active-probe'
import { wslDolphindConnectStateHints } from './wsl-dolphind-connect-state-snapshot'
import { readWslDolphindIncumbent, type WslDolphindIncumbent } from './wsl-dolphind-incumbent'
import { adoptUnrecordedWslDolphind } from './wsl-dolphind-instance-adoption'
import {
  admitWslDolphindLaunch,
  readRestoredWslDolphindRecord,
  recordWslDolphindUpdateFailure,
  wslDolphindDeferralCode,
  wslDolphindDeferralFailure
} from './wsl-dolphind-update-admission'
import { withOwnBuildLaunchEnv } from './wsl-dolphind-own-build-launch-env'
import { WSL_NODE_RUNTIME_DOWNLOAD_BUDGET } from '../execution/wsl-node-runtime-download-budget'

/** Until the persisted deployment record (C7) assigns one, the environment is keyed per distro. */
export function defaultWslDolphindEnvironmentId(distro: string): string {
  return `wsl:${wslDistroHolderKey(distro)}`
}

export async function deployAndLaunchWslDolphind(
  distro: string,
  options: WslDolphindDeployOptions = {}
): Promise<WslDolphindLaunch> {
  const name = distro.trim()
  if (!name) {
    throw new Error('A WSL distro name is required')
  }
  const target: WslDolphindHostTarget = {
    kind: 'wsl',
    id: options.environmentId ?? defaultWslDolphindEnvironmentId(name),
    distro: name,
    label: options.label ?? name
  }
  const conn = (options.createTransport ?? defaultTransport)(target)
  try {
    return await launchOverTransport(name, target, conn, options)
  } finally {
    conn.dispose?.()
  }
}

async function launchOverTransport(
  name: string,
  target: WslDolphindHostTarget,
  transport: DolphindHostTransport,
  options: WslDolphindDeployOptions
): Promise<WslDolphindLaunch> {
  const { signal } = options
  let ownBuildVersion: string | null = null
  // Set by the serving probe; readyLaunch reads the pid itself for any other version.
  let probed: { fullVersion: string; pid: number | null } | null = null
  const conn = withOwnBuildLaunchEnv(transport, () => ownBuildVersion)
  // Acquire a holder before launch or WSL can idle-stop dolphind's distro.
  const holder = options.holder ?? createWslDistroHolder({ userDataPath: userDataPath() })
  // Read GUID alongside deploy; failure leaves the record without one.
  const distroId = (options.readRegistryId ?? readWslDistroRegistryIdShared)(name).catch(() => null)
  const first = await holdWslDistroWithContext(name, target, conn, holder, signal)
  const { held, connectState } = first
  let context = first.context
  const hints = wslDolphindConnectStateHints(connectState, context.activationRecord)
  const slot = managedDolphindSlot(context, DOLPHIND_MANAGED_REMOTE_PORT, signal)
  const recovery = await recoverInterruptedDolphindActivation(slot, connectState ?? undefined)
  if (recovery.outcome === 'pending' || recovery.outcome === 'refused') {
    throw new Error(recovery.reason)
  }
  if (recovery.outcome === 'recovered') {
    context = { ...context, activationRecord: await readDolphindActivationRecord(slot) }
  }
  // Adopt unrecorded dolphind before deploy/wake or its instance lock blocks launch.
  const adoption = await adoptUnrecordedWslDolphind(
    slot,
    context.activationRecord,
    undefined,
    hints.instanceLock(context.activationRecord)
  )
  if (adoption.outcome === 'adopted') {
    context = { ...context, activationRecord: adoption.record }
  }
  const localDolphindDir = await materializeDolphindArtifact(context.serverTarget, {
    signal,
    trustVerificationRecord: true,
    ...(options.templateDir ? { templateDir: options.templateDir } : {})
  })
  const appVersion = getAppEnvironment().getVersion()
  const candidateVersion = readLocalFullVersion(localDolphindDir)
  ownBuildVersion = candidateVersion
  const failureHost = { kind: 'wsl', id: target.id } as const
  const intent = options.intent ?? 'connect'
  const admit = (record: DolphindActivationRecord, admitIntent: DolphindUpdateIntent) =>
    admitWslDolphindLaunch(
      {
        slot,
        record,
        candidateVersion,
        appVersion,
        host: failureHost,
        intent: admitIntent,
        moveRunning: isWslMoveUnderwayOnHost(userDataPath(), name)
      },
      name,
      readyLaunch
    )
  const admitted = await admit(context.activationRecord, intent)
  if ('outcome' in admitted) {
    return admitted
  }
  context = { ...context, activationRecord: admitted }
  const incumbentVersion = context.activationRecord.active
  // Only version changes need incumbent census; same-version connects deploy as no-ops.
  const incumbent: WslDolphindIncumbent | null =
    incumbentVersion && incumbentVersion !== candidateVersion
      ? await (options.readIncumbent ?? readWslDolphindIncumbent)({
          context,
          slot,
          paired: options.pairedOffer ?? null
        })
      : null
  const deployOnce = (extra: Partial<DolphindDeployOptions>) =>
    deployDolphind({
      ...slot,
      conn,
      localDolphindDir,
      target: context.serverTarget,
      ...managedDolphindDeployPolicy(context, appVersion, intent),
      ...(incumbent
        ? {
            census: incumbent.census,
            recountCensus: incumbent.recount,
            releaseIncumbentAdmission: incumbent.releaseAdmission
          }
        : {}),
      force: intent === 'force',
      appVersion,
      recordedNodeRuntimeProbe: true,
      nodeRuntimeDownload: WSL_NODE_RUNTIME_DOWNLOAD_BUDGET,
      ...extra
    }).catch((error: unknown) => {
      if (!signal?.aborted) {
        recordWslDolphindUpdateFailure(failureHost, incumbentVersion, {
          code: 'dolphind_update_failed',
          reason: errorMessage(error)
        })
      }
      throw error
    })
  const { deployed, woken } = await deployWslDolphindWithOneFence(
    slot,
    deployOnce,
    hints.deployPreRead(context.activationRecord)
  )
  if (deployed.outcome === 'installed-not-activated') {
    await removeFailedFreshWslDolphindInstall(slot, deployed)
    const failure = wslDolphindDeferralFailure(deployed)
    recordWslDolphindUpdateFailure(failureHost, incumbentVersion, failure)
    const restored =
      incumbentVersion && failure ? await readRestoredWslDolphindRecord(slot, incumbentVersion) : null
    if (restored) {
      // After rollback proof, serve the restored incumbent on this connect too.
      const retried = await admit(restored, 'connect')
      if ('outcome' in retried) {
        return retried
      }
    }
    const deferredUpdate: WslHostDeferredUpdate = {
      candidateVersion: deployed.fullVersion,
      code: await wslDolphindDeferralCode(slot, deployed, appVersion),
      reason: deployed.reason,
      forceable:
        isForceableDolphindDeferral(deployed.code) ||
        deployed.code === DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE
    }
    // Live-terminal deferrals keep the incumbent serving until Update/Force.
    if (
      incumbentVersion &&
      incumbent?.readiness &&
      isWaitingDolphindUpdateDeferral(deployed.code) &&
      // Another client may have activated since census; refuse stale incumbent assumptions.
      (await readDolphindActivationRecord(slot)).active === incumbentVersion
    ) {
      const serving = {
        fullVersion: incumbentVersion,
        readiness: incumbent.readiness
      }
      await pruneSupersededDolphindCandidates(slot, context.serverTarget, deployed.fullVersion)
      return { ...(await readyLaunch(serving)), deferredUpdate }
    }
    return { outcome: 'deferred', distro: name, ...deferredUpdate }
  }
  clearDolphindUpdateFailedThisLaunch(failureHost)
  const probe = async () => {
    const answer = await probeWslActiveDolphind(context, localDolphindDir, deployed.fullVersion, signal)
    probed = { fullVersion: deployed.fullVersion, pid: answer.pid }
    return answer.readiness
  }
  let readiness: ServeReadiness
  if (deployed.outcome === 'already-active') {
    // A stopped distro ended the active slot with it; the one-fence deploy already woke it.
    await (woken ? null : wakeAlreadyActiveDolphind(slot))
    // Why once more: on a distro still booting, the dolphind the wake saw serving can exit before
    // the probe; that is a stopped slot to start, not a failed connect.
    readiness = await probe().catch(async (error: unknown) => {
      if (!(error instanceof DolphindActiveReadinessError) || error.verdict !== 'exited') {
        throw error
      }
      // A `wsl --shutdown` during a no-boot connect must not be undone by this second wake.
      if (options.requireRunning && !(await options.requireRunning())) {
        throw new WslDistroNotRunningError(name)
      }
      await wakeAlreadyActiveDolphind(slot)
      return probe()
    })
  } else {
    readiness = await probe()
  }
  await pruneWslDolphindVersionsUntilClean(target.id, {
    slot,
    serverTarget: context.serverTarget,
    activeVersion: deployed.fullVersion,
    readiness
  })
  return readyLaunch({ fullVersion: deployed.fullVersion, readiness })

  async function readyLaunch(serving: {
    fullVersion: string
    readiness: ServeReadiness
  }): Promise<Extract<WslDolphindLaunch, { outcome: 'ready' }>> {
    // The serving probe already read it; an admission that serves an incumbent did not.
    const pid =
      probed?.fullVersion === serving.fullVersion
        ? probed.pid
        : await readWslDolphindPid(context, serving.fullVersion, signal)
    return {
      outcome: 'ready',
      distro: name,
      distroId: await distroId,
      port: dolphindBoundPort(serving.readiness) ?? DOLPHIND_MANAGED_REMOTE_PORT,
      fullVersion: serving.fullVersion,
      pid,
      readiness: serving.readiness,
      holder: held.outcome,
      ...(adoption.outcome === 'adopted'
        ? { adoptedInstance: { version: adoption.version, pid: adoption.pid } }
        : {})
    }
  }
}

function defaultTransport(target: WslDolphindHostTarget): WslDolphindHostTransport {
  return createWslDolphindHostTransport({ target })
}

function userDataPath(): string {
  return getAppEnvironment().getPath('userData')
}
