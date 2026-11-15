import type {
  DolphindMigrationCatalogAbortResult,
  DolphindMigrationCatalogReference,
  DolphindMigrationCatalogReferenceAbortResult,
  DolphindMigrationCatalogState,
  DolphindMigrationManifest
} from '../../../../shared/dolphind-migration/dolphind-migration-manifest'
import type { DolphindMigrationBlobDescriptor } from '../../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import type { Store } from '../../../persistence/loading-store/store'

/** A moved history waits while a shell runs in its worktree: that shell would overwrite it. */
type WorktreeHasLiveShells = (worktreeId: string) => boolean

type DolphindMigrationCatalogFlushStore = Partial<Pick<Store, 'flushPendingOrThrowAsync'>>
type DolphindMigrationCatalogStageStore = DolphindMigrationCatalogFlushStore &
  Partial<Pick<Store, 'stageDolphindMigrationCatalog'>>
type DolphindMigrationCatalogCommitStore = DolphindMigrationCatalogFlushStore &
  Partial<
    Pick<Store, 'commitStagedDolphindMigrationCatalog' | 'installDolphindMigrationReceivedBlobs'>
  >
type DolphindMigrationCatalogAbortStore = DolphindMigrationCatalogFlushStore &
  Partial<Pick<Store, 'abortStagedDolphindMigrationCatalog'>>
type DolphindMigrationCatalogAbortByReferenceStore = DolphindMigrationCatalogFlushStore &
  Partial<Pick<Store, 'abortStagedDolphindMigrationCatalogByReference'>>

export async function stageDolphindMigrationCatalogDurably(args: {
  store: DolphindMigrationCatalogStageStore
  manifest: DolphindMigrationManifest
  signal?: AbortSignal
}): Promise<DolphindMigrationCatalogState> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.stageDolphindMigrationCatalog!(args.manifest)
  await flushMigrationState(args.store, args.signal)
  return result
}

export async function commitStagedDolphindMigrationCatalogDurably(args: {
  store: DolphindMigrationCatalogCommitStore
  manifest: DolphindMigrationManifest
  signal?: AbortSignal
  expectedBlobs?: readonly DolphindMigrationBlobDescriptor[]
  onDurableCommit: () => void
  worktreeHasLiveShells?: WorktreeHasLiveShells
}): Promise<DolphindMigrationCatalogState> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.commitStagedDolphindMigrationCatalog!(
    args.manifest,
    args.expectedBlobs ? { expectedBlobs: args.expectedBlobs } : {}
  )
  await flushMigrationState(args.store, args.signal)
  args.onDurableCommit()
  installReceivedBlobs(args.store, args.manifest, args.worktreeHasLiveShells)
  return result
}

/** After the durable commit, on its retries and state queries; the store load retries too. */
function installReceivedBlobs(
  store: Partial<Pick<Store, 'installDolphindMigrationReceivedBlobs'>>,
  manifest: DolphindMigrationManifest,
  worktreeHasLiveShells: WorktreeHasLiveShells | undefined
): void {
  try {
    store.installDolphindMigrationReceivedBlobs?.(manifest, { worktreeHasLiveShells })
  } catch (error) {
    // The catalog is committed; a failed install keeps its blob for the next retry.
    console.error('[dolphind-migration] installing received blobs failed:', error)
  }
}

export async function abortStagedDolphindMigrationCatalogDurably(args: {
  store: DolphindMigrationCatalogAbortStore
  manifest: DolphindMigrationManifest
  signal?: AbortSignal
}): Promise<DolphindMigrationCatalogAbortResult> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.abortStagedDolphindMigrationCatalog!(args.manifest)
  // An already-absent retry may follow an in-memory abort whose flush failed.
  if (result.state === 'absent') {
    await flushMigrationState(args.store, args.signal)
    return { ...result, durableAbsent: true }
  }
  return result
}

export async function abortStagedDolphindMigrationCatalogByReferenceDurably(args: {
  store: DolphindMigrationCatalogAbortByReferenceStore
  reference: DolphindMigrationCatalogReference
  signal?: AbortSignal
}): Promise<DolphindMigrationCatalogReferenceAbortResult> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.abortStagedDolphindMigrationCatalogByReference!(args.reference)
  await flushMigrationState(args.store, args.signal)
  // Either answer is flushed first, so a source that cannot re-send the manifest may act on it.
  return result.state === 'absent'
    ? { ...result, durableAbsent: true }
    : { ...result, durableCommitted: true }
}

export function getDolphindMigrationCatalogState(args: {
  store: Partial<
    Pick<Store, 'getDolphindMigrationCatalogState' | 'installDolphindMigrationReceivedBlobs'>
  >
  manifest: DolphindMigrationManifest
  worktreeHasLiveShells?: WorktreeHasLiveShells
}): DolphindMigrationCatalogState {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.getDolphindMigrationCatalogState!(args.manifest)
  if (result.state === 'committed') {
    installReceivedBlobs(args.store, args.manifest, args.worktreeHasLiveShells)
  }
  return result
}

function flushMigrationState(
  store: DolphindMigrationCatalogFlushStore,
  signal?: AbortSignal
): Promise<void> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  return store.flushPendingOrThrowAsync!({
    signal,
    drainToStableGeneration: false
  })
}
