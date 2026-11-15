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
  DolphindMigrationBlobChunkResult,
  DolphindMigrationBlobDescriptor
} from '../../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import {
  abortStagedDolphindMigrationCatalogByReferenceDurably,
  abortStagedDolphindMigrationCatalogDurably,
  commitStagedDolphindMigrationCatalogDurably,
  getDolphindMigrationCatalogState,
  stageDolphindMigrationCatalogDurably
} from './dolphind-migration-catalog-import'
import { DolphinRuntimeWithResolveExitWaiters } from '../../terminal/wait/terminal-wait-settlements'
import type { RuntimeStore } from '../../construction/runtime-store-contract'

type MigrationStoreKey =
  | 'stageDolphindMigrationCatalog'
  | 'commitStagedDolphindMigrationCatalog'
  | 'stageDolphindMigrationSnapshotChunk'
  | 'stageDolphindMigrationBlobChunk'
  | 'abortStagedDolphindMigrationCatalog'
  | 'abortStagedDolphindMigrationCatalogByReference'
  | 'getDolphindMigrationCatalogState'
  | 'flushPendingOrThrowAsync'

export abstract class DolphinRuntimeWithMigrationCatalog extends DolphinRuntimeWithResolveExitWaiters {
  async stageDolphindMigrationCatalog(
    manifest: DolphindMigrationManifest,
    options: { signal?: AbortSignal } = {}
  ): Promise<DolphindMigrationCatalogState> {
    return stageDolphindMigrationCatalogDurably({
      store: this.requireMigrationStore(
        'stageDolphindMigrationCatalog',
        'flushPendingOrThrowAsync'
      ),
      manifest,
      signal: options.signal
    })
  }

  async commitStagedDolphindMigrationCatalog(
    manifest: DolphindMigrationManifest,
    options: {
      signal?: AbortSignal
      expectedBlobs?: readonly DolphindMigrationBlobDescriptor[]
    } = {}
  ): Promise<DolphindMigrationCatalogState> {
    return commitStagedDolphindMigrationCatalogDurably({
      store: this.requireMigrationStore(
        'commitStagedDolphindMigrationCatalog',
        'flushPendingOrThrowAsync'
      ),
      manifest,
      signal: options.signal,
      expectedBlobs: options.expectedBlobs,
      worktreeHasLiveShells: this.migrationWorktreeHasLiveShells,
      onDurableCommit: () => {
        this.invalidateResolvedWorktreeCache()
        this.notifyReposChanged()
      }
    })
  }

  stageDolphindMigrationSnapshotChunk(
    request: DolphindMigrationSnapshotChunkRequest
  ): DolphindMigrationSnapshotChunkResult {
    // SAFETY: The virtual Store may differ from the checked Store; preserve its native failure.
    return this.requireMigrationStore('stageDolphindMigrationSnapshotChunk')
      .stageDolphindMigrationSnapshotChunk!(request)
  }

  stageDolphindMigrationBlobChunk(
    request: DolphindMigrationBlobChunkRequest
  ): DolphindMigrationBlobChunkResult {
    // SAFETY: The virtual Store may differ from the checked Store; preserve its native failure.
    return this.requireMigrationStore('stageDolphindMigrationBlobChunk')
      .stageDolphindMigrationBlobChunk!(request)
  }

  async abortStagedDolphindMigrationCatalog(
    manifest: DolphindMigrationManifest,
    options: { signal?: AbortSignal } = {}
  ): Promise<DolphindMigrationCatalogAbortResult> {
    return abortStagedDolphindMigrationCatalogDurably({
      store: this.requireMigrationStore(
        'abortStagedDolphindMigrationCatalog',
        'flushPendingOrThrowAsync'
      ),
      manifest,
      signal: options.signal
    })
  }

  async abortStagedDolphindMigrationCatalogByReference(
    reference: DolphindMigrationCatalogReference,
    options: { signal?: AbortSignal } = {}
  ): Promise<DolphindMigrationCatalogReferenceAbortResult> {
    return abortStagedDolphindMigrationCatalogByReferenceDurably({
      store: this.requireMigrationStore(
        'abortStagedDolphindMigrationCatalogByReference',
        'flushPendingOrThrowAsync'
      ),
      reference,
      signal: options.signal
    })
  }

  getDolphindMigrationCatalogState(
    manifest: DolphindMigrationManifest
  ): DolphindMigrationCatalogState {
    return getDolphindMigrationCatalogState({
      store: this.requireMigrationStore('getDolphindMigrationCatalogState'),
      manifest,
      worktreeHasLiveShells: this.migrationWorktreeHasLiveShells
    })
  }

  /** Install deferred migrated history after host-shell discovery; unanswered inventory retries on the next catalog query. */
  async installPendingDolphindMigrationShellHistory(): Promise<void> {
    const store = this.store
    // Every daemon start calls this; no pending blobs must cost no inventory.
    if (
      !store?.installPendingDolphindMigrationReceivedBlobs ||
      !store.hasPendingDolphindMigrationShellHistory?.()
    ) {
      return
    }
    // Inventory first to find restart-surviving shells; real worktrees preserve their restored orchestration receipts.
    if (
      this.ptyController?.listProcesses &&
      !(await this.refreshPtyWorktreeRecordsWithControllerInventory([
        ...(await this.getResolvedWorktreeMap()).values()
      ]))
    ) {
      console.warn(
        '[dolphind-migration] shell history waits: the terminal inventory did not answer'
      )
      return
    }
    store.installPendingDolphindMigrationReceivedBlobs({
      worktreeHasLiveShells: this.migrationWorktreeHasLiveShells
    })
  }

  override onPtyExit(
    ...args: Parameters<DolphinRuntimeWithResolveExitWaiters['onPtyExit']>
  ): ReturnType<DolphinRuntimeWithResolveExitWaiters['onPtyExit']> {
    const worktreeId = this.ptysById.get(args[0])?.worktreeId
    const result = super.onPtyExit(...args)
    if (worktreeId) {
      try {
        this.store?.installDeferredDolphindMigrationShellHistory?.(worktreeId, {
          worktreeHasLiveShells: this.migrationWorktreeHasLiveShells
        })
      } catch (error) {
        console.error('[dolphind-migration] installing deferred shell history failed:', error)
      }
    }
    return result
  }

  // Migrated history belongs here; same-id SSH twins never write it.
  private readonly migrationWorktreeHasLiveShells = (worktreeId: string): boolean =>
    this.getLivePtyIdsForWorktree(worktreeId, undefined, { resolvedConnectionId: null }).size > 0

  // Check the captured Store, not a potentially different virtual return.
  private requireMigrationStore(...methods: MigrationStoreKey[]): RuntimeStore {
    const store = this.store
    if (!store || methods.some((method) => typeof store[method] !== 'function')) {
      throw new Error('runtime_unavailable')
    }
    return this.requireStore()
  }
}
