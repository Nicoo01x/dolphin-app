// Resume journaled migrations after lost contact; source rows stay authoritative until proven commit.
// Retain source rows afterwards for downgrade compatibility.
import { randomUUID } from 'node:crypto'
import type { DolphindManagedConversionResult } from '../../../shared/dolphind-managed-runtime'
import type { DolphindMigrationSourceCutover } from '../../../shared/dolphind-migration/dolphind-migration-source-cutover'
import { recordManagedDolphindMigration } from '../../../shared/remote-runtime/host-store/runtime-environment-managed-dolphind-store'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import {
  getDolphindSshDeployment,
  redactRuntimeEnvironment,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { runTargetLifecycle } from '../../ipc/ssh/ssh-target-lifecycle-queue'
import { environmentMatchesManagedDolphindCutover } from './dolphind-managed-migration-status'
import { requireManagedDolphindInfrastructure } from './dolphind-managed-runtime-context'
import { ensureDolphindManagedTunnel } from './dolphind-managed-tunnel'
import {
  commitDolphindMigrationDestination,
  type DolphindMigrationDestinationCatalog
} from '../migration/cutover/dolphind-migration-cutover-coordinator'
import {
  findDolphindMigrationSourceCutoverForTarget,
  removeDolphindMigrationJournalsForDestination
} from '../../persistence/migrating-dolphind-catalog/dolphind-migration-cutover-journal'
import type { SshTarget } from '../../../shared/ssh-types'
import type { CensusHostRelayTerminals } from '../../ssh/migration-source/dolphind-migration-terminal-gate'
import { createManagedDolphindEnvironment } from './dolphind-runtime-deployment'
import { createSshRelayMigrationSource } from '../../ssh/migration-source/dolphind-migration-ssh-relay-source'
import {
  leaveBehindClearsDolphindMigrationBlockers,
  onlyLeavableDolphindMigrationBlockers
} from '../../ssh/targets/ssh-target-dolphind-preflight'
import { DOLPHIND_MIGRATION_LEAVE_BEHIND_TERMINALS_REASON } from '../../ssh/migration-source/dolphind-migration-source-fence'
import type { DolphindMigrationPaneLeasePredicate } from '../../ssh/migration-source/dolphind-migration-bridged-panes'
import { retainDolphindMigrationSource } from '../../persistence/migrating-dolphind-catalog/dolphind-migration-source-retention'
import {
  enableMovedDolphindAutomations,
  type EnableServerAutomation
} from '../../persistence/migrating-dolphind-catalog/dolphind-migration-moved-automations'
import {
  linkedDolphindMigrationCutoverPort,
  linkedDolphindMigrationProjects,
  linkServerHeldRepositories
} from '../migration/linking/dolphind-migration-repository-link'
import type { DolphindServerRepository } from '../migration/linking/dolphind-server-repositories'
import type { DolphindServerFolderCatalog } from '../migration/linking/dolphind-server-folder-workspaces'

export type DolphindManagedConversionArgs = {
  sshTargetId: string
  name: string
  censusHost?: ((target: SshTarget) => ReturnType<CensusHostRelayTerminals>) | null
  isBridgedPaneLease?: DolphindMigrationPaneLeasePredicate
  destinationFor: (environment: KnownRuntimeEnvironment) => DolphindMigrationDestinationCatalog
  /** Link matching host paths to existing server projects. */
  serverRepositoriesFor?: (environment: KnownRuntimeEnvironment) => Promise<DolphindServerRepository[]>
  /** Link folder workspaces already present from earlier moves. */
  serverFolderCatalogFor?: (
    environment: KnownRuntimeEnvironment
  ) => Promise<DolphindServerFolderCatalog>
  releaseDirectSession?: (sshTargetId: string) => Promise<void>
  /** Re-enables moved automations that ran on this desktop. */
  serverAutomationEnablerFor?: (environment: KnownRuntimeEnvironment) => EnableServerAutomation
  now?: () => Date
  signal?: AbortSignal
}

export async function convertSshTargetToManagedDolphind(
  userDataPath: string,
  args: DolphindManagedConversionArgs
): Promise<DolphindManagedConversionResult> {
  const fenced = await fenceOrResume(userDataPath, args)
  if ('outcome' in fenced) {
    return fenced
  }
  const deployed = await createManagedDolphindEnvironment(userDataPath, {
    name: fenced.destinationName,
    sshTargetId: fenced.sshTargetId,
    migration: true,
    signal: args.signal
  })
  if (deployed.outcome === 'deferred') {
    return deployed // Retain fence and journal for a later resume.
  }
  const environment = listEnvironments(userDataPath).find(
    (entry) => entry.id === fenced.destinationEnvironmentId
  )
  if (!environment || !environmentMatchesManagedDolphindCutover(environment, fenced)) {
    throw new Error('dolphind_migration_destination_environment_mismatch')
  }
  // Record before commit so crashes cannot allow rollback across migrated state.
  recordManagedDolphindMigration(
    userDataPath,
    environment.id,
    (args.now ?? (() => new Date()))().toISOString()
  )
  // Tunnel repair may replace pairing credentials; use its returned environment for every request.
  const marked = await ensureDolphindManagedTunnel(userDataPath, environment.id)
  const { claims, targetStore } = requireManagedDolphindInfrastructure()
  const store = targetStore.getDolphindMigrationSource()
  const destination = args.destinationFor(marked)
  const serverRepositoriesFor = args.serverRepositoriesFor
  const serverFolderCatalogFor = args.serverFolderCatalogFor
  let linked: Pick<
    DolphindMigrationSourceCutover,
    'linkedRepositoryIds' | 'linkedFolderWorkspaceIds'
  > = {}
  const committed = await runTargetLifecycle(fenced.sshTargetId, async () => {
    const journaled = requireJournaledCutover(userDataPath, fenced)
    const cutover = serverRepositoriesFor
      ? await linkServerHeldRepositories({
          userDataPath,
          store,
          claims,
          cutover: journaled,
          destination,
          serverRepositories: () => serverRepositoriesFor(marked),
          ...(serverFolderCatalogFor
            ? { serverFolderCatalog: () => serverFolderCatalogFor(marked) }
            : {}),
          now: args.now
        })
      : journaled
    linked = cutover
    return commitDolphindMigrationDestination(
      {
        userDataPath,
        store,
        claims,
        source: linkedDolphindMigrationCutoverPort({ userDataPath, store, claims, cutover }),
        destination,
        now: args.now
      },
      cutover.migrationId
    )
  })
  if (committed.phase !== 'destination-committed' && committed.phase !== 'source-retired') {
    throw new Error(`dolphind_migration_commit_not_proven:${committed.phase}`)
  }
  let automationsLeftDisabled = 0
  if (committed.phase === 'destination-committed') {
    await retainDolphindMigrationSource(userDataPath, committed.migrationId, store, args.now)
    if (args.serverAutomationEnablerFor) {
      automationsLeftDisabled = await enableMovedDolphindAutomations(
        userDataPath,
        committed.migrationId,
        args.serverAutomationEnablerFor(marked)
      ).catch((error: unknown) => {
        console.warn('[ssh] Could not re-enable moved automations:', error)
        return 0
      })
    }
  }
  const linkedProjects = linkedDolphindMigrationProjects(store, linked)
  return {
    outcome: 'converted',
    environment: redactRuntimeEnvironment(marked),
    migrationId: committed.migrationId,
    ...(linkedProjects.length > 0 ? { linkedProjects } : {}),
    ...(automationsLeftDisabled > 0 ? { automationsLeftDisabled } : {})
  }
}

async function fenceOrResume(
  userDataPath: string,
  args: DolphindManagedConversionArgs
): Promise<
  DolphindMigrationSourceCutover | Extract<DolphindManagedConversionResult, { outcome: 'refused' }>
> {
  const { claims, targetStore } = requireManagedDolphindInfrastructure()
  const target = targetStore.getTarget(args.sshTargetId)
  if (!target) {
    return refuse('unverifiable', 'dolphind_migration_target_not_found', 'The SSH host is gone.')
  }
  const store = targetStore.getDolphindMigrationSource()
  const censusHost = args.censusHost
  const source = createSshRelayMigrationSource({
    userDataPath,
    store,
    claims,
    target,
    censusHost: censusHost ? () => censusHost(target) : null,
    isBridgedPaneLease: args.isBridgedPaneLease
  })
  const existing = source.resolveFence()
  if (existing.state === 'fenced') {
    return existing.cutover
  }
  const stale = existing.state === 'stale-journal' ? existing.cutover : null
  if (stale && !isRegistered(userDataPath, stale.destinationEnvironmentId)) {
    removeDolphindMigrationJournalsForDestination(
      userDataPath,
      target.id,
      stale.destinationEnvironmentId
    )
  }
  const converted = listEnvironments(userDataPath).some(
    (environment) => getDolphindSshDeployment(environment)?.sshTargetId === target.id
  )
  if (converted) {
    return refuse(
      'live',
      'dolphind_migration_already_managed',
      'Dolphin already runs on this SSH host.'
    )
  }
  // Source fencing rechecks leases after acquisition.
  const terminalProof = await source.assessTerminals()
  if (terminalProof.verdict === 'live' || terminalProof.verdict === 'unverifiable') {
    return refuse(terminalProof.verdict, 'dolphind_migration_terminals', terminalProof.reason)
  }
  source.retireProvenExitedTerminals(terminalProof)
  await args.releaseDirectSession?.(target.id)
  const result = await runTargetLifecycle(target.id, () =>
    source.acquireFence({
      destinationEnvironmentId: randomUUID(),
      destinationName: args.name,
      terminalProof,
      now: args.now,
      signal: args.signal
    })
  )
  if (result.outcome === 'fenced') {
    return result.cutover
  }
  if (result.blockers?.length) {
    // Surface blocked state in logs because connect shows only the summary reason.
    console.warn(
      '[ssh] Conversion refused by:',
      JSON.stringify(
        result.blockers.map((blocker) =>
          'dependencies' in blocker
            ? { code: blocker.code, dependencies: blocker.dependencies }
            : { code: blocker.code }
        )
      )
    )
  }
  const leavable =
    result.blockers &&
    onlyLeavableDolphindMigrationBlockers(result.blockers) &&
    !target.managedServerLeaveBehind
  const canLeaveBehind =
    leavable &&
    leaveBehindClearsDolphindMigrationBlockers(
      store,
      target.id,
      terminalProof.verdict === 'bridged' ? terminalProof.bridgedPtyIds : [],
      args.isBridgedPaneLease
    )
  if (leavable && terminalProof.verdict !== 'exited' && !canLeaveBehind) {
    // Leaving tabs behind would strand terminals still served by the legacy bridge.
    return refuse(
      result.verdict,
      result.code,
      `${result.reason} ${DOLPHIND_MIGRATION_LEAVE_BEHIND_TERMINALS_REASON}`
    )
  }
  return {
    ...refuse(result.verdict, result.code, result.reason),
    // Preview confirmation to avoid offering an export the confirmed path would refuse.
    ...(canLeaveBehind ? { canLeaveBehind: true } : {})
  }
}

function requireJournaledCutover(
  userDataPath: string,
  fenced: DolphindMigrationSourceCutover
): DolphindMigrationSourceCutover {
  const journaled = findDolphindMigrationSourceCutoverForTarget(userDataPath, fenced.sshTargetId)
  if (journaled?.migrationId !== fenced.migrationId) {
    throw new Error('dolphind_migration_source_fence_lost')
  }
  return journaled
}

function isRegistered(userDataPath: string, environmentId: string): boolean {
  return listEnvironments(userDataPath).some((environment) => environment.id === environmentId)
}

function refuse(
  verdict: 'live' | 'unverifiable',
  code: string,
  reason: string
): Extract<DolphindManagedConversionResult, { outcome: 'refused' }> {
  return { outcome: 'refused', verdict, code, reason }
}
