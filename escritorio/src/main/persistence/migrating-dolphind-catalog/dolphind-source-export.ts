// Export copies of relay-hosted SSH state without mutating source rows.
import {
  DOLPHIND_MIGRATION_SCROLLBACK_CHUNK_BYTES,
  type DolphindMigrationTerminalScrollbackSnapshot
} from '../../../shared/dolphind-migration/dolphind-migration-scrollback'
import type {
  DolphindMigrationCatalogPayload,
  DolphindMigrationDormantStatePayload,
  DolphindMigrationManifest,
  DolphindMigrationManifestSource
} from '../../../shared/dolphind-migration/dolphind-migration-manifest'
import { assertDolphindMigrationManifestDigest } from '../../dolphind/dolphind-migration-manifest-digest'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import {
  collectDolphindMigrationUntransferredDependencyCensus,
  type DolphindMigrationSourceDependencyCensus
} from './dolphind-source-dependency-census'
import {
  collectDolphindMigrationSourceDormantState,
  type DolphindMigrationSourceDormantInspection
} from './dolphind-source-dormant-state'
import { readDolphindMigrationSourceScrollbackChunk } from './dolphind-source-scrollback-state'
import {
  createDolphindMigrationDeltaView,
  type DolphindMigrationDeltaView
} from './dolphind-source-delta-view'
import { syncDolphindMigrationScrollbackRetention } from './dolphind-source-scrollback-retention'
import { createDolphindMigrationLeaveBehindView } from './dolphind-source-leave-behind-view'
import {
  collectDolphindMigrationSourceDrafts,
  type DolphindMigrationSourceDrafts
} from './dolphind-source-draft-rename'

type DolphindSourceExportRuntime = Pick<
  StoreRuntimeState,
  'state' | 'terminalScrollbackSnapshotStorage' | 'retainedScrollbackRefsByMigrationId'
>

const dolphindSourceExportContext = Symbol('DolphindSourceExportPersistence')

export class DolphindSourceExportPersistence {
  readonly [dolphindSourceExportContext]: DolphindSourceExportRuntime

  constructor(runtime: DolphindSourceExportRuntime) {
    this[dolphindSourceExportContext] = runtime
  }

  collectDolphindMigrationSourceDormantState(
    source: DolphindMigrationManifestSource,
    catalog: DolphindMigrationCatalogPayload,
    destinationEnvironmentId?: string
  ): DolphindMigrationDormantStatePayload {
    const runtime = this[dolphindSourceExportContext]
    return collectDolphindMigrationSourceDormantState(
      runtime.state,
      source,
      catalog,
      runtime.terminalScrollbackSnapshotStorage,
      destinationEnvironmentId
    ).payload
  }

  /** The export plus what it could not carry, for a move that must refuse rather than drop rows. */
  inspectDolphindMigrationSourceDormantState(
    source: DolphindMigrationManifestSource,
    catalog: DolphindMigrationCatalogPayload,
    destinationEnvironmentId?: string,
    daemonHistoryLeaf?: (tabId: string, leafId: string) => boolean
  ): DolphindMigrationSourceDormantInspection {
    const runtime = this[dolphindSourceExportContext]
    return collectDolphindMigrationSourceDormantState(
      runtime.state,
      source,
      catalog,
      runtime.terminalScrollbackSnapshotStorage,
      destinationEnvironmentId,
      daemonHistoryLeaf
    )
  }

  collectDolphindMigrationSourceDrafts(manifest: DolphindMigrationManifest): DolphindMigrationSourceDrafts {
    return collectDolphindMigrationSourceDrafts(this[dolphindSourceExportContext].state, manifest)
  }

  createDolphindMigrationDeltaView(moved: DolphindMigrationManifest): DolphindMigrationDeltaView {
    return createDolphindMigrationDeltaView(this[dolphindSourceExportContext], moved)
  }

  /** Preview "Move anyway" without recording consent. */
  createDolphindMigrationLeaveBehindView(targetId: string): DolphindMigrationDeltaView {
    return createDolphindMigrationLeaveBehindView(this[dolphindSourceExportContext], targetId)
  }

  inspectDolphindMigrationUntransferredDependencies(
    manifest: DolphindMigrationManifest
  ): DolphindMigrationSourceDependencyCensus {
    const runtime = this[dolphindSourceExportContext]
    return collectDolphindMigrationUntransferredDependencyCensus(
      runtime.state,
      manifest,
      runtime.terminalScrollbackSnapshotStorage
    )
  }

  /** Retain unfinished migrations' snapshots even if their tabs close. */
  syncDolphindMigrationScrollbackRetention(pending: readonly DolphindMigrationManifest[]): void {
    syncDolphindMigrationScrollbackRetention(this[dolphindSourceExportContext], pending)
  }

  /** Verify snapshot bytes against the signed manifest so changed buffers cannot be transferred. */
  readDolphindMigrationSourceSnapshotChunk(
    manifest: DolphindMigrationManifest,
    ref: string,
    offset: number
  ): { bytesBase64: string; totalBytes: number; eof: boolean } {
    assertDolphindMigrationManifestDigest(manifest)
    const descriptor: DolphindMigrationTerminalScrollbackSnapshot | undefined =
      manifest.payload.dormantState?.terminalScrollbackSnapshots?.find((entry) => entry.ref === ref)
    if (!descriptor) {
      throw new Error('dolphind_migration_source_snapshot_unknown')
    }
    const runtime = this[dolphindSourceExportContext]
    return readDolphindMigrationSourceScrollbackChunk({
      state: runtime.state,
      descriptor,
      retained: [...runtime.retainedScrollbackRefsByMigrationId.values()].some((refs) =>
        refs.has(ref)
      ),
      offset,
      length: DOLPHIND_MIGRATION_SCROLLBACK_CHUNK_BYTES,
      storage: runtime.terminalScrollbackSnapshotStorage
    })
  }
}
