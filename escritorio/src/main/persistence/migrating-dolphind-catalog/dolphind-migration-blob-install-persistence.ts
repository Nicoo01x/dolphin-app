import { DOLPHIND_MIGRATION_BLOB_KIND_CONTRACTS } from '../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import type { DolphindMigrationManifest } from '../../../shared/dolphind-migration/dolphind-migration-manifest'
import type { PersistedState } from '../../../shared/persisted-state-types'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import { getDaemonHistoryDir } from '../../daemon/launch/daemon-launch-paths'
import { getHistoryRoot } from '../../pty/history/terminal-history-paths'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import {
  findDolphindMigrationImportReceipt,
  isDolphindMigrationCommitDurable
} from './dolphind-catalog-receipt-ledger'
import { installDolphindMigrationReceivedBlobs } from './dolphind-migration-blob-installers'
import { listDolphindMigrationReceivedBlobNames } from './dolphind-migration-blob-staging'
import type { DolphindMigrationRequestIdentity } from './dolphind-migration-staged-file'

type DolphindMigrationBlobInstallRuntime = Pick<
  StoreRuntimeState,
  | 'state'
  | 'dolphindMigrationBlobRoot'
  | 'dolphindTerminalRestoreHints'
  | 'paneShellPath'
  | 'deferredShellHistoryWorktreeIds'
  | 'writeGeneration'
  | 'lastDurableWriteGeneration'
  | 'dolphindMigrationCommitWriteGenerations'
>

type ClockOptions = { now?: () => Date }
type InstallOptions = ClockOptions & {
  /** Defer history installation while shells run in its worktree. */
  worktreeHasLiveShells?: (worktreeId: string) => boolean
}

const dolphindMigrationBlobInstallContext = Symbol('DolphindMigrationBlobInstallPersistence')
type DolphindMigrationBlobInstallContext = {
  runtime: DolphindMigrationBlobInstallRuntime
}

export class DolphindMigrationBlobInstallPersistence {
  readonly [dolphindMigrationBlobInstallContext]: DolphindMigrationBlobInstallContext

  constructor(runtime: DolphindMigrationBlobInstallRuntime) {
    this[dolphindMigrationBlobInstallContext] = { runtime }
  }

  /** Wait for durable commit or a restart could lose both the catalog and its consumed blobs. */
  installDolphindMigrationReceivedBlobs(
    manifest: DolphindMigrationManifest,
    options: InstallOptions = {}
  ): void {
    const receipt = findDolphindMigrationImportReceipt(
      this[dolphindMigrationBlobInstallContext].runtime.state,
      manifest
    )
    if (receipt?.manifestSha256 !== manifest.manifestSha256) {
      return
    }
    installCommitted(this[dolphindMigrationBlobInstallContext].runtime, manifest, options)
  }

  /** Recover interrupted installs; disk-loaded receipts already prove durability. */
  installPendingDolphindMigrationReceivedBlobs(options: InstallOptions = {}): void {
    const { runtime } = this[dolphindMigrationBlobInstallContext]
    for (const receipt of [
      ...(runtime.state.dolphindMigrationImportReceipts ?? []),
      ...(runtime.state.dolphindMigrationEvictedReceipts ?? [])
    ]) {
      try {
        installCommitted(runtime, receipt, options)
      } catch (error) {
        console.error(
          `[dolphind-migration] installing received blobs for ${receipt.migrationId} failed:`,
          error
        )
      }
    }
  }

  /** Only the runtime installs pending shell history. */
  hasPendingDolphindMigrationShellHistory(): boolean {
    const { runtime } = this[dolphindMigrationBlobInstallContext]
    return [
      ...(runtime.state.dolphindMigrationImportReceipts ?? []),
      ...(runtime.state.dolphindMigrationEvictedReceipts ?? [])
    ].some((receipt) =>
      listDolphindMigrationReceivedBlobNames(
        runtime.dolphindMigrationBlobRoot,
        receipt,
        'shell-history'
      ).some((key) => DOLPHIND_MIGRATION_BLOB_KIND_CONTRACTS['shell-history'].key.test(key))
    )
  }

  installDeferredDolphindMigrationShellHistory(
    worktreeId: string,
    options: InstallOptions = {}
  ): void {
    const { runtime } = this[dolphindMigrationBlobInstallContext]
    if (runtime.deferredShellHistoryWorktreeIds.has(worktreeId)) {
      this.installPendingDolphindMigrationReceivedBlobs(options)
    }
  }

  /** Read without consuming. */
  peekDolphindMigrationTerminalRestoreHint(
    paneKey: string,
    worktreeId: string,
    options: ClockOptions = {}
  ): string | null {
    return this[dolphindMigrationBlobInstallContext].runtime.dolphindTerminalRestoreHints.peek(
      paneKey,
      worktreeId,
      clock(options)
    )
  }

  /** Consume after spawn, even if it used a different cwd. */
  consumeDolphindMigrationTerminalRestoreHint(paneKey: string, options: ClockOptions = {}): void {
    this[dolphindMigrationBlobInstallContext].runtime.dolphindTerminalRestoreHints.consume(
      paneKey,
      clock(options)
    )
  }
}

function installCommitted(
  runtime: DolphindMigrationBlobInstallRuntime,
  migration: DolphindMigrationRequestIdentity,
  options: InstallOptions
): void {
  if (!isDolphindMigrationCommitDurable(runtime, migration)) {
    return
  }
  installDolphindMigrationReceivedBlobs({
    migration,
    root: runtime.dolphindMigrationBlobRoot,
    terminalRestoreHints: runtime.dolphindTerminalRestoreHints,
    shellHistoryRoot: getHistoryRoot(),
    terminalHistoryRoot: getDaemonHistoryDir(),
    paneShellPath: () => runtime.paneShellPath(runtime.state.settings?.terminalDefaultShell),
    worktreeHasLiveShells: options.worktreeHasLiveShells,
    deferredShellHistoryWorktreeIds: runtime.deferredShellHistoryWorktreeIds,
    paneWorktreeId: (paneKey) => findPaneWorktreeId(runtime.state, paneKey),
    workspacePath: (worktreeId) => findWorkspacePath(runtime.state, worktreeId),
    now: clock(options)
  })
}

function clock(options: ClockOptions): number {
  return (options.now ?? (() => new Date()))().getTime()
}

// A git worktree id carries its path; a folder workspace's is on its record.
function findWorkspacePath(state: PersistedState, worktreeId: string): string | null {
  const separator = worktreeId.indexOf('::')
  if (separator > 0) {
    return worktreeId.slice(separator + 2) || null
  }
  return state.folderWorkspaces.find((folder) => folder.id === worktreeId)?.folderPath ?? null
}

// The commit merged the moved session in with its worktree ids unchanged.
function findPaneWorktreeId(state: PersistedState, paneKey: string): string | null {
  const tabId = parsePaneKey(paneKey)?.tabId
  if (!tabId) {
    return null
  }
  const sessions = [state.workspaceSession, ...Object.values(state.workspaceSessionsByHostId ?? {})]
  for (const session of sessions) {
    for (const [worktreeId, tabs] of Object.entries(session?.tabsByWorktree ?? {})) {
      if (tabs.some((tab) => tab.id === tabId)) {
        return worktreeId
      }
    }
  }
  return null
}
