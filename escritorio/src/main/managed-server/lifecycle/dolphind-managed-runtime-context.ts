import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { DOLPHIND_UPDATE_TERMINALS_RUNNING_CODE } from '../../../shared/dolphind-managed-runtime'
import {
  getDolphindSshDeployment,
  type KnownRuntimeEnvironment,
  type DolphindSshDeploymentLink
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { getManagedDolphindFenceEnvironmentId } from '../../../shared/managed-dolphind-ssh-owner'
import type { ServeReadiness } from '../../server/serve-readiness'
import { computeLocalDolphindBuildHash } from '../install/dolphind-local-build-hash'

import type { DolphindHostTarget } from '../install/dolphind-host-transport'
import type { DolphindActivationRecord } from '../activation/dolphind-activation-record'
import { admitDolphindRecordForIntent, type DolphindUpdateIntent } from './dolphind-managed-update-decision'
import {
  type DolphindTerminalCensus,
  UNVERIFIABLE_DOLPHIND_TERMINAL_CENSUS
} from '../../../shared/dolphind-terminal-census'
import { probeActiveDolphindReadiness } from '../activation/dolphind-active-readiness'
import { resolveDolphindRemoteContext, type DolphindRemoteContext } from '../install/dolphind-remote-context'
import { DOLPHIND_INSTALL_MODEL } from '../install/remote-install-model'
import { computeRemoteInstallDir } from '../install/remote-versioned-install'
import {
  getSshConnectionManager,
  getSshTargetRegistryStore
} from '../../ssh/targets/ssh-target-registry'

const DOLPHIND_BIND_HOST = '127.0.0.1'

// Pinned slots must fail on absent markers rather than silently use host Node.
const MANAGED_DOLPHIND_LEGACY_NODE_PATH = ''

export function requireManagedDolphindInfrastructure() {
  const targetStore = requireManagedDolphindTargetStore()
  const connectionManager = getSshConnectionManager()
  if (!connectionManager) {
    throw new Error(
      'SSH is unavailable on this client; this host’s Dolphin server is unverifiable.'
    )
  }
  return { connectionManager, targetStore, claims: targetStore.getDolphindRuntimeClaims() }
}

export function requireManagedDolphindTargetStore() {
  const targetStore = getSshTargetRegistryStore()
  if (!targetStore) {
    throw new Error('SSH target state is unavailable; this host’s Dolphin server is unverifiable.')
  }
  return targetStore
}

export function requireManagedDolphindEnvironment(
  userDataPath: string,
  selector: string
): { environment: KnownRuntimeEnvironment; deployment: DolphindSshDeploymentLink } {
  const environment = resolveEnvironment(userDataPath, selector)
  const deployment = getDolphindSshDeployment(environment)
  if (!deployment || environment.connectionDependency !== 'ssh-tunnel') {
    throw new Error('This server is not managed through an dolphind SSH deployment.')
  }
  return { environment, deployment }
}

export async function resolveLinkedDolphindContext(
  environment: KnownRuntimeEnvironment,
  deployment: DolphindSshDeploymentLink,
  signal?: AbortSignal
): Promise<DolphindRemoteContext> {
  const { connectionManager, targetStore } = requireManagedDolphindInfrastructure()
  const target = targetStore.getTarget(deployment.sshTargetId)
  if (
    !target ||
    target.generation !== deployment.sshTargetGeneration ||
    getManagedDolphindFenceEnvironmentId(target) !== environment.id
  ) {
    throw new Error('The SSH registration for this host’s Dolphin server is no longer valid.')
  }
  const connection = await connectionManager.connect(target)
  return resolveDolphindRemoteContext(target, connection, signal)
}

export function managedDolphindSlot(
  context: DolphindRemoteContext<DolphindHostTarget>,
  port: number,
  signal?: AbortSignal
) {
  return {
    conn: context.connection,
    host: context.host,
    remoteHome: context.remoteHome,
    nodePath: MANAGED_DOLPHIND_LEGACY_NODE_PATH,
    userDataDir: context.userDataDir,
    bindHost: DOLPHIND_BIND_HOST,
    port,
    signal
  }
}

export function managedDolphindInstallDir(
  context: DolphindRemoteContext<DolphindHostTarget>,
  version: string
): string {
  return computeRemoteInstallDir(
    DOLPHIND_INSTALL_MODEL,
    context.remoteHome,
    version,
    context.host.pathFlavor
  )
}

/** Accept readiness only from the build this client holds. */
export function probeManagedDolphindReadiness(
  context: DolphindRemoteContext<DolphindHostTarget>,
  localDolphindDir: string,
  fullVersion: string,
  signal?: AbortSignal
): Promise<ServeReadiness> {
  return probeActiveDolphindReadiness(
    {
      conn: context.connection,
      host: context.host,
      remoteInstallDir: managedDolphindInstallDir(context, fullVersion),
      signal
    },
    { buildHash: computeLocalDolphindBuildHash(localDolphindDir), fullVersion }
  )
}

export function managedDolphindDeployPolicy(
  context: Pick<DolphindRemoteContext<DolphindHostTarget>, 'activationRecord'>,
  appVersion: string,
  intent: DolphindUpdateIntent
): {
  census: DolphindTerminalCensus
  recountCensus: () => Promise<DolphindTerminalCensus>
  releaseIncumbentAdmission: () => Promise<void>
  censusRecord: DolphindActivationRecord
  admitRecord: (record: DolphindActivationRecord, candidateVersion: string) => string | null
} {
  // Only the active daemon can count sessions; guessing zero risks restarting live terminals.
  const census: DolphindTerminalCensus = context.activationRecord.active
    ? UNVERIFIABLE_DOLPHIND_TERMINAL_CENSUS
    : { liveSessions: 0, startedSinceActivation: 0, daemonProtocolVersion: null }
  return {
    census,
    recountCensus: async () => census,
    releaseIncumbentAdmission: async () => {},
    censusRecord: context.activationRecord,
    // Only the fenced read can reject newer migrated state or rolled-back builds on this unlinked path.
    admitRecord: admitDolphindRecordForIntent(intent, appVersion)
  }
}

// Force can override live terminal counts, never unknown census or protocol deferrals.
export function isForceableDolphindDeferral(code: string): boolean {
  return code === DOLPHIND_UPDATE_TERMINALS_RUNNING_CODE
}
