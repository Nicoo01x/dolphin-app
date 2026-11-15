import { MAX_DOLPHIND_MIGRATION_STAGED_CATALOGS } from '../../../shared/dolphind-migration/dolphind-migration-staged-catalog-validation'
import { DOLPHIND_CATALOG_COMMIT_DOMAINS } from './dolphind-catalog-commit-domains'
import { DOLPHIND_MIGRATION_MANIFEST_VERSION } from '../../../shared/dolphind-migration/dolphind-migration-manifest-validation'
import type {
  DolphindMigrationCatalogAbortResult,
  DolphindMigrationCatalogReference,
  DolphindMigrationCatalogReferenceAbortResult,
  DolphindMigrationCatalogState,
  DolphindMigrationImportReceipt,
  DolphindMigrationManifest
} from '../../../shared/dolphind-migration/dolphind-migration-manifest'
import type {
  DolphindMigrationSnapshotChunkRequest,
  DolphindMigrationSnapshotChunkResult
} from '../../../shared/dolphind-migration/dolphind-migration-scrollback'
import type {
  DolphindMigrationBlobChunkRequest,
  DolphindMigrationBlobChunkResult,
  DolphindMigrationBlobDescriptor
} from '../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import type { RepoLifecycleOperations } from '../loading-store/project-catalog/repo-lifecycle-operations'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import type { WriteSchedulingOperations } from '../loading-store/profile-writing/write-scheduling'
import { scheduleSave } from '../loading-store/profile-writing/write-scheduling'
import {
  applyPreparedDolphindMigrationCatalog,
  assertDolphindMigrationReceiptMatchesManifest,
  assertSameDolphindMigrationManifest,
  prepareDolphindMigrationCatalog,
  type PreparedDolphindMigrationCatalog
} from './dolphind-catalog-records'
import {
  expireDolphindMigrationStages,
  findDolphindMigrationImportReceipt,
  isLiveDolphindMigrationStage,
  recordDolphindMigrationCommitWriteGeneration,
  recordDolphindMigrationImportReceipt,
  type DolphindMigrationCommitGenerationRuntime
} from './dolphind-catalog-receipt-ledger'
import {
  abortDolphindMigrationSnapshots,
  assertDolphindMigrationSnapshotsReady,
  commitDolphindMigrationSnapshots,
  inspectDolphindMigrationSnapshotUploads,
  pruneDolphindMigrationSnapshotStaging,
  stageDolphindMigrationSnapshotChunk
} from './dolphind-scrollback-snapshot-transfer'
import {
  abortDolphindMigrationBlobs,
  assertDolphindMigrationBlobSetMatches,
  assertDolphindMigrationBlobsReady,
  commitDolphindMigrationBlobs,
  inspectDolphindMigrationBlobUploads,
  pruneDolphindMigrationBlobStaging,
  stageDolphindMigrationBlobChunk
} from './dolphind-migration-blob-staging'
import { withStagedAutomationRunHistory } from './dolphind-staged-automation-run-history'
import { assertDolphindMigrationBlobContentsValid } from './dolphind-migration-blob-installers'
import {
  abortDolphindMigrationCatalogByReference,
  committedMigrations,
  stagedManifests
} from './dolphind-catalog-reference-abort'

type DolphindCatalogImportRuntime = DolphindMigrationCommitGenerationRuntime &
  Pick<StoreRuntimeState, 'state' | 'terminalScrollbackSnapshotStorage' | 'dolphindMigrationBlobRoot'>

const dolphindCatalogImportContext = Symbol('DolphindCatalogImportPersistence')
type DolphindCatalogImportContext = {
  runtime: DolphindCatalogImportRuntime
  repos: RepoLifecycleOperations
  scheduling: WriteSchedulingOperations
}

// Manifests arrive parsed; the RPC boundary verified the digest over the bytes as sent.

export class DolphindCatalogImportPersistence {
  readonly [dolphindCatalogImportContext]: DolphindCatalogImportContext

  constructor(
    runtime: DolphindCatalogImportRuntime,
    repos: RepoLifecycleOperations,
    scheduling: WriteSchedulingOperations
  ) {
    this[dolphindCatalogImportContext] = { runtime, repos, scheduling }
  }

  stageDolphindMigrationCatalog(
    manifest: DolphindMigrationManifest,
    options: { now?: () => Date } = {}
  ): DolphindMigrationCatalogState {
    const context = this[dolphindCatalogImportContext]
    const now = options.now ?? (() => new Date())
    if (expireDolphindMigrationStages(context.runtime.state, now().getTime())) {
      scheduleSave(context.scheduling, ['dolphindMigrationStagedCatalogs'])
    }
    pruneDolphindMigrationSnapshotStaging(
      stagedManifests(context.runtime.state),
      context.runtime.terminalScrollbackSnapshotStorage
    )
    pruneDolphindMigrationBlobStaging(
      stagedManifests(context.runtime.state),
      committedMigrations(context.runtime.state),
      context.runtime.dolphindMigrationBlobRoot
    )
    const current = migrationCatalogState(context.runtime, manifest)
    if (current.state === 'committed') {
      return current
    }
    prepareDolphindMigrationCatalog(manifest, context.runtime.state)
    if (current.state === 'staged') {
      return current
    }
    const staged = context.runtime.state.dolphindMigrationStagedCatalogs ?? []
    if (staged.length >= MAX_DOLPHIND_MIGRATION_STAGED_CATALOGS) {
      throw new Error('dolphind_migration_staging_capacity_exceeded')
    }
    const stagedAt = now().toISOString()
    context.runtime.state.dolphindMigrationStagedCatalogs = [
      ...staged,
      {
        version: DOLPHIND_MIGRATION_MANIFEST_VERSION,
        manifest: structuredClone(manifest),
        stagedAt
      }
    ]
    scheduleSave(context.scheduling, ['dolphindMigrationStagedCatalogs'])
    return stagedCatalogState(manifest, stagedAt, context.runtime)
  }

  stageDolphindMigrationSnapshotChunk(
    request: DolphindMigrationSnapshotChunkRequest
  ): DolphindMigrationSnapshotChunkResult {
    const context = this[dolphindCatalogImportContext]
    return stageDolphindMigrationSnapshotChunk({
      stagedManifest:
        stagedManifests(context.runtime.state).find(
          (manifest) => manifest.migrationId === request.migrationId
        ) ?? null,
      storage: context.runtime.terminalScrollbackSnapshotStorage,
      request
    })
  }

  stageDolphindMigrationBlobChunk(
    request: DolphindMigrationBlobChunkRequest
  ): DolphindMigrationBlobChunkResult {
    const context = this[dolphindCatalogImportContext]
    return stageDolphindMigrationBlobChunk({
      stagedManifest:
        stagedManifests(context.runtime.state).find(
          (manifest) => manifest.migrationId === request.migrationId
        ) ?? null,
      root: context.runtime.dolphindMigrationBlobRoot,
      request
    })
  }

  /** Omitted expectedBlobs preserves older senders' commit behavior. */
  commitStagedDolphindMigrationCatalog(
    manifest: DolphindMigrationManifest,
    options: { now?: () => Date; expectedBlobs?: readonly DolphindMigrationBlobDescriptor[] } = {}
  ): DolphindMigrationCatalogState {
    const context = this[dolphindCatalogImportContext]
    const current = migrationCatalogState(context.runtime, manifest)
    if (current.state === 'committed') {
      return current
    }
    if (current.state !== 'staged') {
      throw new Error('dolphind_migration_catalog_not_staged')
    }
    const blobRoot = context.runtime.dolphindMigrationBlobRoot
    assertDolphindMigrationSnapshotsReady(manifest, context.runtime.terminalScrollbackSnapshotStorage)
    if (options.expectedBlobs) {
      assertDolphindMigrationBlobSetMatches(manifest, blobRoot, options.expectedBlobs)
    }
    assertDolphindMigrationBlobsReady(manifest, blobRoot)
    assertDolphindMigrationBlobContentsValid(manifest, blobRoot)
    const prepared = prepareDolphindMigrationCatalog(
      withStagedAutomationRunHistory(manifest, blobRoot),
      context.runtime.state
    )
    commitDolphindMigrationSnapshots(manifest, context.runtime.terminalScrollbackSnapshotStorage)
    commitDolphindMigrationBlobs(manifest, blobRoot)
    const receipt = commitPreparedCatalog(context, manifest, prepared, options.now)
    const generationBefore = context.runtime.writeGeneration
    scheduleSave(context.scheduling, DOLPHIND_CATALOG_COMMIT_DOMAINS)
    recordDolphindMigrationCommitWriteGeneration(context.runtime, manifest, generationBefore)
    return committedCatalogState(receipt)
  }

  abortStagedDolphindMigrationCatalog(
    manifest: DolphindMigrationManifest
  ): DolphindMigrationCatalogAbortResult {
    const context = this[dolphindCatalogImportContext]
    const current = migrationCatalogState(context.runtime, manifest)
    if (current.state === 'committed' || current.state === 'absent') {
      return { ...current, aborted: false }
    }
    // Staged rows are dormant and unreferenced outside this stage.
    context.runtime.state.dolphindMigrationStagedCatalogs = (
      context.runtime.state.dolphindMigrationStagedCatalogs ?? []
    ).filter((entry) => entry.manifest.migrationId !== manifest.migrationId)
    abortDolphindMigrationSnapshots(manifest, context.runtime.terminalScrollbackSnapshotStorage)
    abortDolphindMigrationBlobs(manifest, context.runtime.dolphindMigrationBlobRoot)
    scheduleSave(context.scheduling, ['dolphindMigrationStagedCatalogs'])
    return { ...absentCatalogState(manifest), aborted: true }
  }

  /** Use the stored manifest when the source cannot send one. */
  abortStagedDolphindMigrationCatalogByReference(
    reference: DolphindMigrationCatalogReference
  ): DolphindMigrationCatalogReferenceAbortResult {
    return abortDolphindMigrationCatalogByReference(
      this[dolphindCatalogImportContext].runtime.state,
      reference,
      (manifest) => this.abortStagedDolphindMigrationCatalog(manifest)
    )
  }

  getDolphindMigrationCatalogState(manifest: DolphindMigrationManifest): DolphindMigrationCatalogState {
    const context = this[dolphindCatalogImportContext]
    return migrationCatalogState(context.runtime, manifest)
  }

  hasStagedDolphindMigrationCatalog(now: number = Date.now()): boolean {
    return (this[dolphindCatalogImportContext].runtime.state.dolphindMigrationStagedCatalogs ?? []).some(
      (entry) => isLiveDolphindMigrationStage(entry.stagedAt, now)
    )
  }
}

function commitPreparedCatalog(
  context: DolphindCatalogImportContext,
  manifest: DolphindMigrationManifest,
  prepared: PreparedDolphindMigrationCatalog,
  now?: () => Date
): DolphindMigrationImportReceipt {
  applyPreparedDolphindMigrationCatalog(prepared, context.runtime.state, context.repos)
  const receipt: DolphindMigrationImportReceipt = {
    version: DOLPHIND_MIGRATION_MANIFEST_VERSION,
    migrationId: manifest.migrationId,
    manifestSha256: manifest.manifestSha256,
    source: structuredClone(manifest.source),
    importedAt: (now ?? (() => new Date()))().toISOString(),
    repositoryIds: prepared.repositories.map((repo) => repo.id),
    projectGroupIds: prepared.projectGroups.map((group) => group.id),
    folderWorkspaceIds: prepared.folderWorkspaces.map((workspace) => workspace.id)
  }
  context.runtime.state.dolphindMigrationStagedCatalogs = (
    context.runtime.state.dolphindMigrationStagedCatalogs ?? []
  ).filter((entry) => entry.manifest.migrationId !== manifest.migrationId)
  recordDolphindMigrationImportReceipt(context.runtime.state, receipt)
  return receipt
}

function migrationCatalogState(
  runtime: DolphindCatalogImportRuntime,
  manifest: DolphindMigrationManifest
): DolphindMigrationCatalogState {
  const { state } = runtime
  const receipt = findDolphindMigrationImportReceipt(state, manifest)
  if (receipt) {
    assertCommittedReceipt(receipt, manifest)
    return committedCatalogState(receipt)
  }
  const staged = state.dolphindMigrationStagedCatalogs?.find(
    (entry) => entry.manifest.migrationId === manifest.migrationId
  )
  if (!staged) {
    return absentCatalogState(manifest)
  }
  assertSameDolphindMigrationManifest(staged.manifest, manifest)
  return stagedCatalogState(manifest, staged.stagedAt, runtime)
}

// A committed receipt stays authoritative even after live rows and snapshots change.
function assertCommittedReceipt(
  receipt: DolphindMigrationImportReceipt,
  manifest: DolphindMigrationManifest
): void {
  if (receipt.manifestSha256 !== manifest.manifestSha256) {
    throw new Error('dolphind_migration_id_reused_with_different_manifest')
  }
  assertDolphindMigrationReceiptMatchesManifest(receipt, manifest)
}

function absentCatalogState(manifest: DolphindMigrationManifest): DolphindMigrationCatalogState {
  return {
    state: 'absent',
    migrationId: manifest.migrationId,
    manifestSha256: manifest.manifestSha256
  }
}

function stagedCatalogState(
  manifest: DolphindMigrationManifest,
  stagedAt: string,
  runtime: DolphindCatalogImportRuntime
): DolphindMigrationCatalogState {
  const snapshotUploads = inspectDolphindMigrationSnapshotUploads(
    manifest,
    runtime.terminalScrollbackSnapshotStorage
  )
  // Omit absent uploads to preserve older hosts' response shape.
  const blobUploads = inspectDolphindMigrationBlobUploads(manifest, runtime.dolphindMigrationBlobRoot)
  return {
    state: 'staged',
    migrationId: manifest.migrationId,
    manifestSha256: manifest.manifestSha256,
    stagedAt,
    ...(snapshotUploads ? { snapshotUploads } : {}),
    ...(blobUploads ? { blobUploads } : {})
  }
}

function committedCatalogState(receipt: DolphindMigrationImportReceipt): DolphindMigrationCatalogState {
  return {
    state: 'committed',
    migrationId: receipt.migrationId,
    manifestSha256: receipt.manifestSha256,
    receipt: structuredClone(receipt)
  }
}
