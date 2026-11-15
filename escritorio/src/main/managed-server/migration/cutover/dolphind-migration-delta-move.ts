/** Journal only additions made after conversion to the same server; retain the full journal chain and source rows. Stage conflicts leave the changed mark and source intact; uncertain outcomes keep the journal for resume. */
import {
  DOLPHIND_MIGRATION_SOURCE_CUTOVER_VERSION,
  type DolphindMigrationSourceCutover
} from '../../../../shared/dolphind-migration/dolphind-migration-source-cutover'
import type { DolphindDeltaMoveResult } from '../../../../shared/dolphind-managed-runtime'
import { recordManagedDolphindMigration } from '../../../../shared/remote-runtime/host-store/runtime-environment-managed-dolphind-store'
import type { KnownRuntimeEnvironment } from '../../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { SshTarget } from '../../../../shared/ssh-types'
import type { Store } from '../../../persistence/loading-store/store'
import {
  abortDolphindMigrationCutover,
  commitDolphindMigrationDestination,
  type DolphindMigrationCutoverContext,
  type DolphindMigrationDestinationCatalog
} from './dolphind-migration-cutover-coordinator'
import {
  findDolphindMigrationSourceCutoverForTarget,
  listDolphindMigrationCutoverChainForTarget,
  removeDolphindMigrationSourceCutover,
  writeDolphindMigrationSourceCutover
} from '../../../persistence/migrating-dolphind-catalog/dolphind-migration-cutover-journal'
import {
  committedDolphindMigrationChain,
  dolphindDeltaSourceStore,
  planDolphindDeltaMove,
  unfinishedDolphindDelta,
  type DolphindDeltaMovePlan
} from './dolphind-migration-delta-plan'
import { assertDolphindMigrationRequestFits } from '../catalog/dolphind-migration-request-budget'
import { retainDolphindMigrationSource } from '../../../persistence/migrating-dolphind-catalog/dolphind-migration-source-retention'
import {
  assessDolphindMigrationTerminals,
  type DolphindMigrationTerminalVerdict,
  retireProvenExitedLeases,
  type CensusHostRelayTerminals
} from '../../../ssh/migration-source/dolphind-migration-terminal-gate'
import {
  currentDolphindSourceFingerprint,
  dolphindCatalogFingerprint,
  unmovedDolphindSourceRows,
  withKeptDolphindSourceRows
} from '../../../persistence/migrating-dolphind-catalog/dolphind-retained-source'
import { collectDolphindMigrationSourceCatalog } from '../../../persistence/migrating-dolphind-catalog/dolphind-source-catalog'
import type { SshTargetDolphindClaims } from '../../../ssh/targets/ssh-target-dolphind-claims'
import { dolphindMigrationRefusalReason } from './dolphind-migration-refusal-reason'
import { errorMessage } from '../../../../shared/error-message'

type DolphindDeltaMoveArgs = {
  userDataPath: string
  store: Store
  claims: SshTargetDolphindClaims
  target: SshTarget
  environment: KnownRuntimeEnvironment
  /** Build the destination after opening its tunnel: re-pairing during open can replace commit credentials. */
  connectDestination: () => Promise<DolphindMigrationDestinationCatalog>
  /** Host census proves exit or identifies terminals preserved by the legacy bridge. */
  censusHost?: CensusHostRelayTerminals | null
  /** Serialize journal-through-commit with all other lifecycle changes to this host. */
  runTargetLifecycle: <T>(targetId: string, operation: () => Promise<T>) => Promise<T>
  now?: () => Date
}

export async function runDolphindDeltaMove(
  args: DolphindDeltaMoveArgs
): Promise<DolphindDeltaMoveResult> {
  const { userDataPath, store, target } = args
  const now = args.now ?? (() => new Date())
  const plan = planDolphindDeltaMove(userDataPath, store, target, { now })
  // Capture baseline with the manifest before awaiting so both describe the same source.
  const planned = currentDolphindSourceFingerprint(store, target)
  if (!plan.resumes && plan.added.length === 0) {
    return refuse('dolphind_delta_nothing_new', 'An older build added nothing new to move.')
  }
  if (plan.blockers.length > 0) {
    return {
      ...refuse(
        'dolphind_migration_preflight_blocked',
        dolphindMigrationRefusalReason(plan.blockers)
      ),
      blockers: plan.blockers
    }
  }
  if (!plan.resumes) {
    // Reject before journaling or an unsendable delta could pin the fence permanently.
    assertDolphindMigrationRequestFits({ manifest: plan.manifest })
  }
  const terminals = await assessDolphindMigrationTerminals(store, target.id, args.censusHost)
  if (terminals.verdict !== 'exited' && terminals.verdict !== 'bridged') {
    return refuse('dolphind_migration_terminals', terminals.reason)
  }
  const settled: SettledTerminals = terminals
  retireProvenExitedLeases(store, target.id, terminals)
  return args.runTargetLifecycle(target.id, async () => {
    // Another move may have journaled or finished while waiting for the lifecycle lock.
    const changedAt = store.getSshTarget(target.id)?.dolphindFence?.sourceChangedAt
    const head = findDolphindMigrationSourceCutoverForTarget(userDataPath, target.id)
    if (!changedAt || head?.migrationId !== (plan.resumes ?? plan.head).migrationId) {
      return refuse('dolphind_delta_superseded', 'Another move of this host ran first.')
    }
    // Source remains writable before fencing; edits during census must not silently become the manifest's baseline.
    if (!plan.resumes && planned !== currentDolphindSourceFingerprint(store, target)) {
      return refuse(
        'dolphind_delta_source_changed',
        'This host changed while the move was starting. Try the move again.'
      )
    }
    const cutover = plan.resumes ?? journalDelta(args, plan, planned, settled, now)
    return commitDelta(args, plan, cutover, changedAt, now)
  })
}

type SettledTerminals = Extract<DolphindMigrationTerminalVerdict, { verdict: 'exited' | 'bridged' }>

function journalDelta(
  args: DolphindDeltaMoveArgs,
  plan: DolphindDeltaMovePlan,
  planned: string,
  terminals: SettledTerminals,
  now: () => Date
): DolphindMigrationSourceCutover {
  const timestamp = now().toISOString()
  const cutover: DolphindMigrationSourceCutover = {
    version: DOLPHIND_MIGRATION_SOURCE_CUTOVER_VERSION,
    migrationId: plan.manifest.migrationId,
    phase: 'source-fenced',
    startedAt: timestamp,
    updatedAt: timestamp,
    destinationEnvironmentId: plan.environmentId,
    destinationName: plan.head.destinationName,
    sshTargetId: args.target.id,
    sshTargetGeneration: plan.head.sshTargetGeneration,
    manifestSha256: plan.manifest.manifestSha256,
    provenPtyIds: terminals.verdict === 'exited' ? terminals.provenPtyIds : [],
    // COMPAT(legacy-relay-bridge): a move leaves relay terminals running for the bridge too.
    ...(terminals.verdict === 'bridged' ? { bridgedPtyIds: terminals.bridgedPtyIds } : {}),
    supersedesMigrationId: plan.head.migrationId,
    // Retained rows must match the whole source captured with this manifest.
    sourceBaselineFingerprint: planned,
    manifest: plan.manifest
  }
  writeDolphindMigrationSourceCutover(args.userDataPath, cutover)
  return cutover
}

async function commitDelta(
  args: DolphindDeltaMoveArgs,
  plan: DolphindDeltaMovePlan,
  cutover: DolphindMigrationSourceCutover,
  changedAt: string,
  now: () => Date
): Promise<DolphindDeltaMoveResult> {
  const { userDataPath, store, target } = args
  // Clear the changed mark and freeze source for the move.
  store.updateSshTarget(target.id, { dolphindFence: { environmentId: plan.environmentId } })
  await args.claims.flush()
  // Record before any new/resumed commit so rollback cannot cross the migration.
  recordManagedDolphindMigration(userDataPath, plan.environmentId, now().toISOString())
  let destination: DolphindMigrationDestinationCatalog
  try {
    destination = await args.connectDestination()
  } catch (error) {
    // No request reached the server; keep the journal for later resume.
    await restoreChangedMark(args, cutover, changedAt)
    throw error
  }
  const context: DolphindMigrationCutoverContext = {
    userDataPath,
    store: plan.source,
    freshSource: () => dolphindDeltaSourceStore(store, target, plan.moved, cutover.manifest),
    claims: args.claims,
    destination,
    now
  }
  try {
    const committed = await commitDolphindMigrationDestination(context, cutover.migrationId)
    if (committed.phase !== 'destination-committed' && committed.phase !== 'source-retired') {
      throw new Error(`dolphind_migration_commit_not_proven:${committed.phase}`)
    }
  } catch (error) {
    const released = await releaseUncommittedDelta(args, context, cutover, changedAt)
    if (released === 'released') {
      return refuse('dolphind_delta_refused_by_server', errorMessage(error))
    }
    if (released === 'kept') {
      throw error
    }
  }
  await retainDolphindMigrationSource(userDataPath, cutover.migrationId, store, now)
  return { outcome: 'moved', migrationId: cutover.migrationId }
}

/** Release only on proven destination absence; otherwise retain journal for resume. Restore the host's changed mark either way. */
async function releaseUncommittedDelta(
  args: DolphindDeltaMoveArgs,
  context: DolphindMigrationCutoverContext,
  cutover: DolphindMigrationSourceCutover,
  changedAt: string
): Promise<'released' | 'committed' | 'kept'> {
  const restoreMark = (): Promise<void> => restoreChangedMark(args, cutover, changedAt)
  try {
    const result = await abortDolphindMigrationCutover(context, cutover.migrationId, async () => {
      // Restore the mark first so a crash during journal removal leaves a resumable marked host.
      await restoreMark()
      removeDolphindMigrationSourceCutover(args.userDataPath, cutover.migrationId)
    })
    return result.outcome === 'released' ? 'released' : 'committed'
  } catch {
    await restoreMark()
    return 'kept'
  }
}

async function restoreChangedMark(
  args: Pick<DolphindDeltaMoveArgs, 'store' | 'claims'>,
  cutover: DolphindMigrationSourceCutover,
  changedAt: string
): Promise<void> {
  args.store.updateSshTarget(cutover.sshTargetId, {
    dolphindFence: { environmentId: cutover.destinationEnvironmentId, sourceChangedAt: changedAt }
  })
  await args.claims.flush()
}

/** Keep older-build changes only in retained profile rows. */
export async function keepDolphindServerVersion(args: {
  userDataPath: string
  store: Store
  claims: SshTargetDolphindClaims
  target: SshTarget
}): Promise<void> {
  const environmentId = args.target.dolphindFence?.environmentId
  const chain = listDolphindMigrationCutoverChainForTarget(args.userDataPath, args.target.id)
  if (unfinishedDolphindDelta(chain)) {
    // Unfinished moves may already have copied rows; only commit/abort can decide.
    throw new Error('dolphind_delta_move_unfinished')
  }
  const head = committedDolphindMigrationChain(chain).at(-1)
  if (!environmentId || !args.target.dolphindFence?.sourceChangedAt || !head) {
    throw new Error('dolphind_delta_not_changed')
  }
  const current = collectDolphindMigrationSourceCatalog(args.store, args.target)
  const unmoved = unmovedDolphindSourceRows(current, committedDolphindMigrationChain(chain))
  writeDolphindMigrationSourceCutover(args.userDataPath, {
    ...withKeptDolphindSourceRows(head, unmoved),
    // Explicit reconcile accepts the current retained source as the new baseline.
    sourceBaselineFingerprint: dolphindCatalogFingerprint(current)
  })
  args.store.updateSshTarget(args.target.id, { dolphindFence: { environmentId } })
  await args.claims.flush()
}

function refuse(
  code: string,
  reason: string
): Extract<DolphindDeltaMoveResult, { outcome: 'refused' }> {
  return { outcome: 'refused', code, reason }
}
