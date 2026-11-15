import type { FolderWorkspace } from '../folder-workspaces/folder-workspace-types'
import type { Automation } from '../automations/automation-definition'
import type { AutomationRun } from '../automations/history/automation-run'
import type { DolphindMigrationManifestVersion } from './dolphind-migration-manifest-validation'
import type { ProjectGroup } from '../project-group-types'
import type { Repo } from '../repo-types'
import type { SparsePreset } from '../worktree/create-types'
import type { WorkspaceLineage, WorktreeLineage } from '../worktree/lineage-types'
import type { WorktreeMeta } from '../worktree/meta-types'
import type { RetiredNameRegistry } from '../worktree/retired-name-registry'
import type { WorkspaceSessionState } from '../workspace-session/workspace-session-state-types'
import type { DolphindMigrationClientStatePayload } from './dolphind-migration-client-state'
import type {
  DolphindMigrationSnapshotUploadState,
  DolphindMigrationTerminalScrollbackSnapshot
} from './dolphind-migration-scrollback'
import type { DolphindMigrationBlobUploadState } from './dolphind-migration-blob-transfer'

import { isRecord } from './dolphind-migration-manifest-fields'

/** The relay-era SSH source: on the wire it never carries `kind` (see dolphind-migration-source-kind). */
export type DolphindMigrationSshManifestSource = {
  sshTargetId: string
  sshTargetGeneration: number | null
  targetLabel: string
}

/** Explicit desktop WSL project scope prevents destination path inference; generation orders delta moves. */
export type DolphindMigrationLocalWslManifestSource = {
  kind: 'local-wsl'
  distro: string
  /** The distro's registry id, when known: a re-registered distro of the same name is another one. */
  distroGuid?: string
  scopeRepoIds: string[]
  scopeFolderWorkspaceIds: string[]
  generation: number
}

export type DolphindMigrationManifestSource =
  | DolphindMigrationSshManifestSource
  | DolphindMigrationLocalWslManifestSource

export type DolphindMigrationCatalogPayload = {
  repositories: Repo[]
  projectGroups: ProjectGroup[]
  folderWorkspaces: FolderWorkspace[]
  dormantState?: DolphindMigrationDormantStatePayload
}

export type DolphindMigrationDormantWorktreeMeta = {
  sourceKey: string
  worktreeId: string
  meta: WorktreeMeta
}

export type DolphindMigrationDormantWorktreeLineage = {
  sourceKey: string
  worktreeId: string
  lineage: WorktreeLineage
}

export type DolphindMigrationDormantWorkspaceLineage = {
  sourceKey: string
  childWorkspaceKey: string
  lineage: WorkspaceLineage
}

export type DolphindMigrationDormantRetiredNames = {
  repoId: string
  registry: RetiredNameRegistry
}

export type DolphindMigrationDormantRetirementNamespace = {
  sourceNamespaceKeys: string[]
  namespaceKey: string
  registry: RetiredNameRegistry
}

export type DolphindMigrationAutomationRunHistoryRef = {
  sha256: string
  byteLength: number
}

export type DolphindMigrationDormantStatePayload = {
  version: 1
  worktreeMeta: DolphindMigrationDormantWorktreeMeta[]
  worktreeLineage: DolphindMigrationDormantWorktreeLineage[]
  workspaceLineage: DolphindMigrationDormantWorkspaceLineage[]
  sparsePresets: SparsePreset[]
  retiredWorktreeNames: DolphindMigrationDormantRetiredNames[]
  retiredWorktreeNamespaces: DolphindMigrationDormantRetirementNamespace[]
  workspaceSession?: WorkspaceSessionState
  terminalScrollbackSnapshots?: DolphindMigrationTerminalScrollbackSnapshot[]
  automations?: Automation[]
  /** Inline runs, as older desktops send them; never alongside `automationRunHistory`. */
  automationRuns?: AutomationRun[]
  /** Digest of the runs sent as an `automation-run-history` blob, so history never bounds the manifest. */
  automationRunHistory?: DolphindMigrationAutomationRunHistoryRef
  /** Client-owned durable intent projected to the destination authority. */
  clientState?: DolphindMigrationClientStatePayload
}

export type DolphindMigrationManifest = {
  version: DolphindMigrationManifestVersion
  migrationId: string
  createdAt: string
  source: DolphindMigrationManifestSource
  payload: DolphindMigrationCatalogPayload
  /** Destination runtime identity used to re-key desktop routing after commit. */
  destinationEnvironmentId?: string
  manifestSha256: string
}

export type DolphindMigrationImportReceipt = {
  version: DolphindMigrationManifestVersion
  migrationId: string
  manifestSha256: string
  source: DolphindMigrationManifestSource
  importedAt: string
  repositoryIds: string[]
  projectGroupIds: string[]
  folderWorkspaceIds: string[]
}

export type DolphindMigrationStagedCatalog = {
  version: DolphindMigrationManifestVersion
  manifest: DolphindMigrationManifest
  stagedAt: string
}

export type DolphindMigrationCatalogState =
  | {
      state: 'absent'
      migrationId: string
      manifestSha256: string
    }
  | {
      state: 'staged'
      migrationId: string
      manifestSha256: string
      stagedAt: string
      snapshotUploads?: DolphindMigrationSnapshotUploadState[]
      /** Blobs staged so far; absent from hosts without the blob channel. */
      blobUploads?: DolphindMigrationBlobUploadState[]
    }
  | {
      state: 'committed'
      migrationId: string
      manifestSha256: string
      receipt: DolphindMigrationImportReceipt
    }

export type DolphindMigrationCatalogAbortResult = DolphindMigrationCatalogState & {
  aborted: boolean
  durableAbsent?: true
}

export type DolphindMigrationCatalogReference = Pick<
  DolphindMigrationManifest,
  'migrationId' | 'manifestSha256'
>

/** An abort by reference: no receipt, since an evicted one is rebuilt only from the manifest. */
export type DolphindMigrationCatalogReferenceAbortResult = DolphindMigrationCatalogReference & {
  state: 'absent' | 'committed'
  aborted: boolean
  durableAbsent?: true
  /** The receipt was flushed before this answer; older hosts never send it. */
  durableCommitted?: true
}

export function dolphindMigrationManifestHashInput(
  manifest: Omit<DolphindMigrationManifest, 'manifestSha256'>
): string {
  return serializeDolphindMigrationValue(manifest)
}

export function serializeDolphindMigrationValue(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value))
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue)
  }
  if (!isRecord(value)) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalizeJsonValue(entry)])
  )
}
