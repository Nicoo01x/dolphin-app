/** Keep source authority until durable destination commit. Verify the fenced export before stage/commit; resolve lost replies by catalog reads and persist journal transitions before returning. Never release a committed destination. */
import type {
  DolphindMigrationCatalogAbortResult,
  DolphindMigrationCatalogReference,
  DolphindMigrationCatalogReferenceAbortResult,
  DolphindMigrationCatalogState,
  DolphindMigrationManifest
} from '../../../../shared/dolphind-migration/dolphind-migration-manifest'
import type {
  DolphindMigrationSnapshotChunkRequest,
  DolphindMigrationSnapshotChunkResult
} from '../../../../shared/dolphind-migration/dolphind-migration-scrollback'
import type {
  DolphindMigrationBlobChunkRequest,
  DolphindMigrationBlobChunkResult
} from '../../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import type {
  DolphindMigrationSourceCutover,
  DolphindMigrationSourceCutoverPhase
} from '../../../../shared/dolphind-migration/dolphind-migration-source-cutover'
import { resolveDurableDolphindCatalogMutation } from './dolphind-catalog-durable-mutation'
import { DOLPHIND_MIGRATION_DESTINATION_UNSUPPORTED } from '../catalog/dolphind-migration-request'
import { dolphindMigrationRequestFits } from '../catalog/dolphind-migration-request-budget'
import {
  listDolphindMigrationSourceCutovers,
  writeDolphindMigrationSourceCutover
} from '../../../persistence/migrating-dolphind-catalog/dolphind-migration-cutover-journal'
import type { DolphindMigrationSourceCutoverPort } from './dolphind-migration-source'
import {
  transferDolphindMigrationSnapshots,
  type DolphindMigrationSnapshotSource
} from '../transfers/dolphind-migration-snapshot-coordinator'
import {
  exportedDolphindMigrationBlobSource,
  transferDolphindMigrationBlobs
} from '../transfers/dolphind-migration-blob-coordinator'
import type { DolphindMigrationExportedBlob } from '../../../persistence/migrating-dolphind-catalog/dolphind-migration-manifest-export'
import type { DolphindMigrationPreflightStore } from '../../../ssh/targets/ssh-target-dolphind-preflight'
import { sshRelayMigrationCutoverPort } from '../../../ssh/migration-source/dolphind-migration-ssh-relay-source'
import type { SshTargetDolphindClaims } from '../../../ssh/targets/ssh-target-dolphind-claims'

export type DolphindMigrationDestinationCatalog = {
  readState: (manifest: DolphindMigrationManifest) => Promise<DolphindMigrationCatalogState>
  stage: (manifest: DolphindMigrationManifest) => Promise<DolphindMigrationCatalogState>
  commit: (manifest: DolphindMigrationManifest) => Promise<DolphindMigrationCatalogState>
  abort: (manifest: DolphindMigrationManifest) => Promise<DolphindMigrationCatalogAbortResult>
  /** Use identity-only abort when the journal's full manifest cannot fit a request. */
  abortByReference: (
    manifest: DolphindMigrationCatalogReference
  ) => Promise<DolphindMigrationCatalogReferenceAbortResult>
  stageChunk: (
    request: DolphindMigrationSnapshotChunkRequest
  ) => Promise<DolphindMigrationSnapshotChunkResult>
  /** Read fresh before blobs are sent: each blob kind needs its own capability. */
  readCapabilities: () => Promise<readonly string[]>
  stageBlobChunk: (
    request: DolphindMigrationBlobChunkRequest
  ) => Promise<DolphindMigrationBlobChunkResult>
}

export type DolphindMigrationCutoverContext = {
  userDataPath: string
  store: DolphindMigrationPreflightStore & DolphindMigrationSnapshotSource
  claims: SshTargetDolphindClaims
  destination: DolphindMigrationDestinationCatalog
  /** Rebuild copied stores for each check so concurrent edits remain visible. */
  freshSource?: () => DolphindMigrationPreflightStore
  /** The fenced source; defaults to the relay-era SSH target the journal names. */
  source?: DolphindMigrationSourceCutoverPort
  now?: () => Date
}

function cutoverSource(
  context: DolphindMigrationCutoverContext
): DolphindMigrationSourceCutoverPort {
  return context.source ?? sshRelayMigrationCutoverPort(context)
}

export async function stageDolphindMigrationDestination(
  context: DolphindMigrationCutoverContext,
  migrationId: string
): Promise<DolphindMigrationSourceCutover> {
  let cutover = requireCutover(context.userDataPath, migrationId)
  if (cutover.phase === 'destination-committed' || cutover.phase === 'source-retired') {
    return cutover
  }
  const blobs = assertSourceUnchanged(context, cutover)
  const { destination } = context
  const read = await destination.readState(cutover.manifest)
  const state =
    read.state === 'committed'
      ? await confirmDurableCommit(destination, cutover.manifest)
      : await resolveDurableDolphindCatalogMutation(
          () => destination.stage(cutover.manifest),
          () => destination.readState(cutover.manifest),
          (observed) => observed.state !== 'absent'
        )
  cutover = recordObservedState(context, cutover, state)
  if (state.state === 'staged') {
    await transferDolphindMigrationSnapshots({
      source: context.store,
      manifest: cutover.manifest,
      state,
      destination: { readState: destination.readState, stageChunk: destination.stageChunk }
    })
    await transferDolphindMigrationBlobs({
      source: exportedDolphindMigrationBlobSource(blobs),
      manifest: cutover.manifest,
      blobs: blobs.map((blob) => blob.descriptor),
      destination: {
        readCapabilities: destination.readCapabilities,
        readState: destination.readState,
        stageChunk: destination.stageBlobChunk
      }
    })
  }
  return cutover
}

export async function commitDolphindMigrationDestination(
  context: DolphindMigrationCutoverContext,
  migrationId: string
): Promise<DolphindMigrationSourceCutover> {
  const staged = await stageDolphindMigrationDestination(context, migrationId)
  if (staged.phase !== 'destination-staged') {
    return staged
  }
  assertSourceUnchanged(context, staged)
  const { destination } = context
  // A lost commit reply may hide success; catalog read decides the next step.
  const state = await resolveDurableDolphindCatalogMutation(
    () => destination.commit(staged.manifest),
    () => destination.readState(staged.manifest),
    (observed) => observed.state === 'committed'
  )
  if (state.state !== 'committed') {
    throw new Error(`dolphind_migration_commit_not_committed:${state.state}`)
  }
  return recordObservedState(context, staged, state)
}

export type DolphindMigrationAbortResult =
  | { outcome: 'released'; evidence: 'catalog-absent' | 'destination-unsupported' }
  | { outcome: 'refused'; code: string; reason: string }

/** Release only on proven destination absence; default drops journal/fence, while delta moves retain the fence. */
export async function abortDolphindMigrationCutover(
  context: DolphindMigrationCutoverContext,
  migrationId: string,
  release: (cutover: DolphindMigrationSourceCutover) => Promise<void> = (cutover) =>
    cutoverSource(context).releaseFence(cutover)
): Promise<DolphindMigrationAbortResult> {
  const cutover = requireCutover(context.userDataPath, migrationId)
  if (cutover.phase === 'destination-committed' || cutover.phase === 'source-retired') {
    return committedRefusal()
  }
  const { destination } = context
  // Older journals can hold oversized manifests; identity-only abort must still release them.
  if (!dolphindMigrationRequestFits({ manifest: cutover.manifest })) {
    const aborted = await destination.abortByReference(cutover.manifest)
    if (aborted.state === 'committed') {
      return committedRefusal()
    }
    await release(cutover)
    return { outcome: 'released', evidence: 'catalog-absent' }
  }
  let state: DolphindMigrationCatalogState
  try {
    state = await destination.readState(cutover.manifest)
  } catch (error) {
    // Unsupported proves absence only before any stage could have landed.
    if (isDestinationUnsupported(error) && cutover.phase === 'source-fenced') {
      await release(cutover)
      return { outcome: 'released', evidence: 'destination-unsupported' }
    }
    throw error
  }
  if (state.state !== 'committed') {
    state = await abortWithRecovery(destination, cutover.manifest)
  }
  if (state.state === 'committed') {
    recordObservedState(context, cutover, await confirmDurableCommit(destination, cutover.manifest))
    return committedRefusal()
  }
  if (state.state !== 'absent') {
    throw new Error(`dolphind_migration_abort_not_absent:${state.state}`)
  }
  await release(cutover)
  return { outcome: 'released', evidence: 'catalog-absent' }
}

/** Committed reads may be unflushed memory; require the idempotent commit acknowledgement to prove durability. */
export async function confirmDurableCommit(
  destination: DolphindMigrationDestinationCatalog,
  manifest: DolphindMigrationManifest
): Promise<DolphindMigrationCatalogState> {
  const state = await destination.commit(manifest)
  if (state.state !== 'committed') {
    throw new Error(`dolphind_migration_commit_not_committed:${state.state}`)
  }
  return state
}

function assertSourceUnchanged(
  context: DolphindMigrationCutoverContext,
  cutover: DolphindMigrationSourceCutover
): DolphindMigrationExportedBlob[] {
  return cutoverSource(context).verifyFence(cutover)
}

/** Persist observed state before returning. */
function recordObservedState(
  context: DolphindMigrationCutoverContext,
  cutover: DolphindMigrationSourceCutover,
  state: DolphindMigrationCatalogState
): DolphindMigrationSourceCutover {
  if (state.state === 'absent') {
    throw new Error('dolphind_migration_destination_catalog_absent')
  }
  if (
    state.migrationId !== cutover.migrationId ||
    state.manifestSha256 !== cutover.manifestSha256
  ) {
    throw new Error('dolphind_migration_destination_state_mismatch')
  }
  if (
    state.state === 'committed' &&
    (state.receipt.migrationId !== cutover.migrationId ||
      state.receipt.manifestSha256 !== cutover.manifestSha256)
  ) {
    throw new Error('dolphind_migration_destination_receipt_mismatch')
  }
  const phase: DolphindMigrationSourceCutoverPhase =
    state.state === 'committed' ? 'destination-committed' : 'destination-staged'
  if (phase === cutover.phase) {
    return cutover
  }
  if (cutover.phase === 'destination-committed' || cutover.phase === 'source-retired') {
    // Never regress a proven commit.
    return cutover
  }
  const next: DolphindMigrationSourceCutover = {
    ...cutover,
    phase,
    updatedAt: (context.now ?? (() => new Date()))().toISOString()
  }
  writeDolphindMigrationSourceCutover(context.userDataPath, next)
  return next
}

/** Aborts staging; a failed abort is decided by a re-read, never assumed. */
export async function abortWithRecovery(
  destination: DolphindMigrationDestinationCatalog,
  manifest: DolphindMigrationManifest
): Promise<DolphindMigrationCatalogState> {
  try {
    return await destination.abort(manifest)
  } catch (abortError) {
    try {
      const observed = await destination.readState(manifest)
      if (observed.state === 'committed') {
        return observed
      }
      if (observed.state === 'absent') {
        // Absent reads may predate flush; repeat abort to prove durable absence.
        return await destination.abort(manifest)
      }
    } catch {
      // Keep the original failure and fence while abort remains unverifiable.
    }
    throw abortError
  }
}

function requireCutover(userDataPath: string, migrationId: string): DolphindMigrationSourceCutover {
  const cutover = listDolphindMigrationSourceCutovers(userDataPath).find(
    (entry) => entry.migrationId === migrationId
  )
  if (!cutover) {
    throw new Error('dolphind_migration_source_cutover_not_found')
  }
  return cutover
}

function committedRefusal(): DolphindMigrationAbortResult {
  return {
    outcome: 'refused',
    code: 'dolphind_migration_committed_source_cannot_be_released',
    reason: 'This host’s Dolphin server already holds this migration; it can only move forward.'
  }
}

function isDestinationUnsupported(error: unknown): boolean {
  return error instanceof Error && error.message === DOLPHIND_MIGRATION_DESTINATION_UNSUPPORTED
}
