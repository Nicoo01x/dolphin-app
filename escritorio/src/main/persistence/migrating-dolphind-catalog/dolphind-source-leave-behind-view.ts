// Offer "Move anyway" only when a consent-free preview shows it clears the blockers.
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import { collectDolphindMigrationUntransferredDependencyCensus } from './dolphind-source-dependency-census'
import { collectDolphindMigrationSourceDormantState } from './dolphind-source-dormant-state'
import type { DolphindMigrationDeltaView } from './dolphind-source-delta-view'

export function createDolphindMigrationLeaveBehindView(
  runtime: Pick<StoreRuntimeState, 'state' | 'terminalScrollbackSnapshotStorage'>,
  targetId: string
): DolphindMigrationDeltaView {
  // Read-only collectors make a shallow copy sufficient.
  const state = {
    ...runtime.state,
    sshTargets: runtime.state.sshTargets.map((target) =>
      target.id === targetId
        ? { ...target, managedServerLeaveBehind: { confirmedAt: new Date(0).toISOString() } }
        : target
    )
  }
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
