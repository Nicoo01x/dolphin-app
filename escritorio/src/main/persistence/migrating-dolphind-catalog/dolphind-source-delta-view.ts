// Export only additions from older builds by subtracting prior migrations from a profile copy.
import type {
  DolphindMigrationCatalogPayload,
  DolphindMigrationDormantStatePayload,
  DolphindMigrationManifest,
  DolphindMigrationManifestSource
} from '../../../shared/dolphind-migration/dolphind-migration-manifest'
import type { FolderWorkspace } from '../../../shared/folder-workspaces/folder-workspace-types'
import type { ProjectGroup } from '../../../shared/project-group-types'
import type { Repo } from '../../../shared/repo-types'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import { subtractDolphindSourceCatalogState } from './dolphind-source-catalog-subtraction'
import {
  collectDolphindMigrationUntransferredDependencyCensus,
  type DolphindMigrationSourceDependencyCensus
} from './dolphind-source-dependency-census'
import { subtractDolphindMigrationSourceDormantState } from './dolphind-source-dormant-subtraction'
import { collectDolphindMigrationSourceDormantState } from './dolphind-source-dormant-state'
import { subtractDolphindMigrationScopeWorkspaceSession } from './dolphind-source-workspace-session-subtraction'

export type DolphindMigrationDeltaView = {
  getRepos: () => Repo[]
  getFolderWorkspaces: () => FolderWorkspace[]
  getProjectGroups: () => ProjectGroup[]
  collectDolphindMigrationSourceDormantState: (
    source: DolphindMigrationManifestSource,
    catalog: DolphindMigrationCatalogPayload,
    destinationEnvironmentId?: string
  ) => DolphindMigrationDormantStatePayload
  inspectDolphindMigrationUntransferredDependencies: (
    manifest: DolphindMigrationManifest
  ) => DolphindMigrationSourceDependencyCensus
}

/** moved includes today's edits to previously migrated rows. */
export function createDolphindMigrationDeltaView(
  runtime: Pick<StoreRuntimeState, 'state' | 'terminalScrollbackSnapshotStorage'>,
  moved: DolphindMigrationManifest
): DolphindMigrationDeltaView {
  const state = structuredClone(runtime.state)
  subtractDolphindSourceCatalogState(state, moved)
  subtractDolphindMigrationSourceDormantState(state, moved)
  // The server owns the moved projects' tabs now, even ones the older build left unmovable.
  subtractDolphindMigrationScopeWorkspaceSession(state, moved)
  const storage = runtime.terminalScrollbackSnapshotStorage
  return {
    getRepos: () => state.repos,
    getFolderWorkspaces: () => state.folderWorkspaces,
    getProjectGroups: () => state.projectGroups,
    collectDolphindMigrationSourceDormantState: (source, catalog, destinationEnvironmentId) =>
      collectDolphindMigrationSourceDormantState(
        state,
        source,
        catalog,
        storage,
        destinationEnvironmentId
      ).payload,
    inspectDolphindMigrationUntransferredDependencies: (manifest) =>
      collectDolphindMigrationUntransferredDependencyCensus(state, manifest, storage)
  }
}
