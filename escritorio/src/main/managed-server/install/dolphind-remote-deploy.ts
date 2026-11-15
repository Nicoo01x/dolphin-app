/** Activate under a durable host fence/journal only after candidate readiness. Recover the incumbent only with safe profile state; retain changed state/snapshot for explicit recovery. */
import { logDolphindActivationOutcome } from '../activation/dolphind-activation-outcome-log'
import { join } from 'node:path'
import type { DolphindHostTransport } from './dolphind-host-transport'
import type { DolphindUpdateForce } from '../activation/dolphind-update-plan'
import { DOLPHIND_INSTALL_MODEL } from './remote-install-model'
import { computeRemoteInstallDir, readLocalFullVersion } from './remote-versioned-install'
import { readDolphindActivationRecord } from '../activation/dolphind-activation-record-store'
import type { DolphindActivationRecord } from '../activation/dolphind-activation-record'
import type { DolphindActivationVerdict } from '../activation/dolphind-activation-gate'
import type { DolphindTerminalCensus } from '../../../shared/dolphind-terminal-census'
import type { RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import { installDolphindBundle } from './dolphind-remote-install'
import { getAppEnvironment } from '../../../shared/app-environment'
import type { NodeRuntimeTarget } from '../../../shared/node-runtime-pin'
import { DOLPHIND_STARTUP_READINESS_TIMEOUT_MS } from '../../../shared/dolphind-profile-preflight'
import { materializeDolphindArtifact } from '../../dolphind/dolphind-artifact-materializer'
import { readDolphindBundleTarget } from './dolphind-deployment-target'
import { resolveDolphindRuntimeTarget } from '../lifecycle/dolphind-runtime-target'
import {
  dolphindNodeRuntimeInstallOptions,
  type NodeRuntimeDownloadBudget
} from './dolphind-node-runtime-install-options'
import {
  dolphindActivationFenceExists,
  resolveDolphindActivationReadinessTimeout,
  withDolphindActivationLock
} from '../activation/dolphind-activation-lock'
import { activateInstalledDolphind } from '../activation/dolphind-installed-activation'
import { dolphindActivationFenceRefusal } from '../activation/dolphind-activation-fence-hold'

export type DolphindDeployOptions = {
  conn: DolphindHostTransport
  host: RemoteHostPlatform
  remoteHome: string
  /** An already assembled bundle; otherwise materialize the packaged template for this host. */
  localDolphindDir?: string
  /** The bundle's runtime target; read from `localDolphindDir` or probed when absent. */
  target?: NodeRuntimeTarget
  /** Where the pinned runtime archive is cached; defaults beside the dolphind artifact cache. */
  runtimeCacheRoot?: string
  nodePath: string
  userDataDir: string
  bindHost: string
  port: number
  /** Caller supplies a protocol-aware census; unanswered host evidence must never become zero live terminals. */
  census: DolphindTerminalCensus
  /** Bind census to its incumbent record; a changed locked record makes earlier counts unverifiable. */
  censusRecord?: DolphindActivationRecord
  /** WSL only: the record and fence this connect read moments ago; skips the same pre-upload reads. */
  preRead?: { record: DolphindActivationRecord; fenceOpen: boolean }
  /** WSL only: a same-version deploy skips its fence; the caller's wake re-checks under its own. */
  sameVersionFencedByCaller?: boolean
  /** Recount under fence just before stopping the same incumbent; uploads may outdate initial counts and failures stay unverifiable. */
  recountCensus: () => Promise<DolphindTerminalCensus>
  /** Best-effort reopen when incumbent keeps serving; admission also expires server-side. */
  releaseIncumbentAdmission: () => Promise<void>
  force?: DolphindUpdateForce
  /** The Dolphin app version activating, recorded so an older client never downgrades the host. */
  appVersion?: string
  /** Reapply version policy under lock because peer activation/stop may land during upload. */
  admitRecord?: (record: DolphindActivationRecord, candidateVersion: string) => string | null
  readinessTimeoutMs?: number
  /** WSL only; SSH hosts always re-hash the runtime (see `installDolphindBundle`). */
  recordedNodeRuntimeProbe?: boolean
  /** WSL only: bounded Node runtime downloads; SSH keeps the default timing. */
  nodeRuntimeDownload?: NodeRuntimeDownloadBudget
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  signal?: AbortSignal
}

export type DolphindDeployResult =
  | { outcome: 'installed-and-activated'; fullVersion: string; verdict: DolphindActivationVerdict }
  | { outcome: 'already-active'; fullVersion: string }
  | {
      outcome: 'installed-not-activated'
      fullVersion: string
      code: string
      reason: string
      /** The candidate's own preflight or launch check failed; a deferral never sets this. */
      startCheckFailed?: true
      /** This deploy uploaded the slot rather than finding it already installed. */
      freshlyInstalled?: true
    }

export async function deployDolphind(
  input: DolphindDeployOptions,
  retryClearedFence = true
): Promise<DolphindDeployResult> {
  const target =
    input.target ??
    (input.localDolphindDir
      ? readDolphindBundleTarget(input.localDolphindDir)
      : await resolveDolphindRuntimeTarget(input))
  const runtimeCacheRoot =
    input.runtimeCacheRoot ?? join(getAppEnvironment().getPath('userData'), 'dolphind-artifacts')
  const options = {
    ...input,
    target,
    readinessTimeoutMs: resolveDolphindActivationReadinessTimeout(
      input.readinessTimeoutMs,
      DOLPHIND_STARTUP_READINESS_TIMEOUT_MS
    ),
    ...dolphindNodeRuntimeInstallOptions(target, runtimeCacheRoot, input),
    localDolphindDir:
      input.localDolphindDir ?? (await materializeDolphindArtifact(target, { signal: input.signal }))
  }
  const fullVersion = readLocalFullVersion(options.localDolphindDir)
  const remoteDir = computeRemoteInstallDir(DOLPHIND_INSTALL_MODEL, options.remoteHome, fullVersion)
  const held = async (): Promise<DolphindDeployResult> => {
    const { cleared, ...refusal } = await dolphindActivationFenceRefusal(options, 'update')
    // Retry one cleared abandoned fence; repeated abandonment must surface to the caller.
    if (cleared && retryClearedFence) {
      return deployDolphind(
        {
          ...input,
          preRead: undefined,
          sameVersionFencedByCaller: undefined,
          target,
          localDolphindDir: options.localDolphindDir
        },
        false
      )
    }
    return { outcome: 'installed-not-activated', fullVersion, ...refusal }
  }
  // Refuse before upload, then re-read both admission inputs under fence.
  const preUploadRecord = options.preRead?.record ?? (await readDolphindActivationRecord(options))
  const censusRecord = options.censusRecord ?? preUploadRecord
  // An unanswered probe only skips this shortcut; lock acquisition still arbitrates.
  if (
    !options.preRead?.fenceOpen &&
    (await dolphindActivationFenceExists(options).catch(() => false))
  ) {
    return held()
  }

  const installed = await installDolphindBundle(options, fullVersion, remoteDir)
  if (options.sameVersionFencedByCaller && preUploadRecord.active === fullVersion) {
    return { outcome: 'already-active', fullVersion }
  }

  const result = await logDolphindActivationOutcome(
    `update to ${fullVersion}`,
    () =>
      withDolphindActivationLock(
        options,
        (lock) =>
          activateInstalledDolphind({ ...options, censusRecord }, fullVersion, remoteDir, lock),
        held
      ),
    ['installed-and-activated', 'already-active']
  )
  return installed === 'uploaded' && result.outcome === 'installed-not-activated'
    ? { ...result, freshlyInstalled: true }
    : result
}
