// Commit receipts remain authoritative indefinitely; abandoned stages expire.
import { MAX_DOLPHIND_MIGRATION_IMPORT_RECEIPTS } from '../../../shared/dolphind-migration/dolphind-migration-manifest-validation'
import type {
  DolphindMigrationImportReceipt,
  DolphindMigrationManifest
} from '../../../shared/dolphind-migration/dolphind-migration-manifest'
import { MAX_DOLPHIND_MIGRATION_EVICTED_RECEIPTS } from '../../../shared/dolphind-migration/dolphind-migration-evicted-receipts'
import type { PersistedState } from '../../../shared/persisted-state-types'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import {
  dolphindMigrationStagingKey,
  type DolphindMigrationRequestIdentity
} from './dolphind-migration-staged-file'

// Allow a week for clients that went offline mid-move.
export const DOLPHIND_MIGRATION_STAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function findDolphindMigrationImportReceipt(
  state: PersistedState,
  manifest: DolphindMigrationManifest
): DolphindMigrationImportReceipt | undefined {
  const receipt = state.dolphindMigrationImportReceipts?.find(
    (entry) => entry.migrationId === manifest.migrationId
  )
  if (receipt) {
    return receipt
  }
  const evicted = state.dolphindMigrationEvictedReceipts?.find(
    (entry) => entry.migrationId === manifest.migrationId
  )
  // Rebuild the remaining receipt fields from the manifest.
  return evicted
    ? {
        version: manifest.version,
        migrationId: evicted.migrationId,
        manifestSha256: evicted.manifestSha256,
        source: structuredClone(manifest.source),
        importedAt: evicted.importedAt,
        repositoryIds: manifest.payload.repositories.map((repo) => repo.id),
        projectGroupIds: manifest.payload.projectGroups.map((group) => group.id),
        folderWorkspaceIds: manifest.payload.folderWorkspaces.map((workspace) => workspace.id)
      }
    : undefined
}

/** Compact evicted receipts without losing proof of commit. */
export function recordDolphindMigrationImportReceipt(
  state: PersistedState,
  receipt: DolphindMigrationImportReceipt
): void {
  const receipts = [...(state.dolphindMigrationImportReceipts ?? []), receipt]
  const overflow = receipts.length - MAX_DOLPHIND_MIGRATION_IMPORT_RECEIPTS
  if (overflow > 0) {
    state.dolphindMigrationEvictedReceipts = [
      ...(state.dolphindMigrationEvictedReceipts ?? []),
      ...receipts.slice(0, overflow).map(({ migrationId, manifestSha256, importedAt }) => ({
        migrationId,
        manifestSha256,
        importedAt
      }))
    ].slice(-MAX_DOLPHIND_MIGRATION_EVICTED_RECEIPTS)
  }
  state.dolphindMigrationImportReceipts = receipts.slice(-MAX_DOLPHIND_MIGRATION_IMPORT_RECEIPTS)
}

export function isLiveDolphindMigrationStage(stagedAt: string, now: number): boolean {
  return now - Date.parse(stagedAt) < DOLPHIND_MIGRATION_STAGE_TTL_MS
}

export function expireDolphindMigrationStages(state: PersistedState, now: number): boolean {
  const staged = state.dolphindMigrationStagedCatalogs ?? []
  const live = staged.filter((entry) => isLiveDolphindMigrationStage(entry.stagedAt, now))
  if (live.length === staged.length) {
    return false
  }
  state.dolphindMigrationStagedCatalogs = live
  return true
}

export type DolphindMigrationCommitGenerationRuntime = Pick<
  StoreRuntimeState,
  'writeGeneration' | 'lastDurableWriteGeneration' | 'dolphindMigrationCommitWriteGenerations'
>

/** Call right after the commit's `scheduleSave`; `generationBefore` is read just before it. */
export function recordDolphindMigrationCommitWriteGeneration(
  runtime: DolphindMigrationCommitGenerationRuntime,
  migration: DolphindMigrationRequestIdentity,
  generationBefore: number
): void {
  // Suppressed saves never advance generation; only a disk-loaded receipt can prove durability.
  runtime.dolphindMigrationCommitWriteGenerations.set(
    dolphindMigrationStagingKey(migration),
    runtime.writeGeneration > generationBefore ? runtime.writeGeneration : Number.POSITIVE_INFINITY
  )
}

/** Require disk durability before consuming blobs a restart might need to retry. */
export function isDolphindMigrationCommitDurable(
  runtime: DolphindMigrationCommitGenerationRuntime,
  migration: DolphindMigrationRequestIdentity
): boolean {
  const key = dolphindMigrationStagingKey(migration)
  const required = runtime.dolphindMigrationCommitWriteGenerations.get(key)
  if (required === undefined) {
    return true
  }
  if (runtime.lastDurableWriteGeneration < required) {
    return false
  }
  runtime.dolphindMigrationCommitWriteGenerations.delete(key)
  return true
}
