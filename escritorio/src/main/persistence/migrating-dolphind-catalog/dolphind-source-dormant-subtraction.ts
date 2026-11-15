import type { DolphindMigrationManifest } from '../../../shared/dolphind-migration/dolphind-migration-manifest'
import type { PersistedState } from '../../../shared/persisted-state-types'
import { subtractDolphindSourceWorktreeMetadata } from './dolphind-source-worktree-metadata'
import { subtractDolphindMigrationSourceAutomationState } from './dolphind-source-automation-subtraction'
import { subtractDolphindMigrationSourceWorkspaceSession } from './dolphind-source-workspace-session-subtraction'
import { subtractDolphindMigrationClientState } from './dolphind-source-client-subtraction'

/** Mutate a delta-view copy only. */
export function subtractDolphindMigrationSourceDormantState(
  state: PersistedState,
  manifest: DolphindMigrationManifest
): void {
  // Include state a downgraded build added even when the manifest had none.
  subtractDolphindSourceWorktreeMetadata(state, manifest)
  subtractDolphindMigrationSourceAutomationState(state, manifest)
  const dormant = manifest.payload.dormantState
  if (!dormant) {
    return
  }
  dormant.worktreeLineage.forEach((entry) => delete state.worktreeLineageById[entry.sourceKey])
  dormant.workspaceLineage.forEach(
    (entry) => delete state.workspaceLineageByChildKey[entry.sourceKey]
  )
  for (const preset of dormant.sparsePresets) {
    const remaining = (state.sparsePresetsByRepo[preset.repoId] ?? []).filter(
      (entry) => entry.id !== preset.id
    )
    if (remaining.length > 0) {
      state.sparsePresetsByRepo[preset.repoId] = remaining
    } else {
      delete state.sparsePresetsByRepo[preset.repoId]
    }
  }
  for (const entry of dormant.retiredWorktreeNames) {
    delete state.retiredWorktreeNamesByRepo?.[entry.repoId]
  }
  subtractDolphindMigrationSourceWorkspaceSession(state, manifest)
  subtractDolphindMigrationClientState(state, manifest)
  // Retain snapshot files: the prior durable profile and rollback evidence can still reference them.
}
