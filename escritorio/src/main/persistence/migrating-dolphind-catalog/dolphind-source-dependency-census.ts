import type { DolphindMigrationManifest } from '../../../shared/dolphind-migration/dolphind-migration-manifest'
import {
  DOLPHIND_MIGRATION_DEPENDENCY_KINDS,
  type DolphindMigrationDependencyKind
} from '../../../shared/dolphind-migration/dolphind-migration-preflight'
import type { PersistedState } from '../../../shared/persisted-state-types'
import type { TerminalScrollbackSnapshotStorage } from '../../pty/scrollback/terminal-scrollback-snapshots'
import {
  inspectDolphindMigrationSourceSessions,
  type DolphindMigrationSourceSessionInspection
} from './dolphind-source-session-dependencies'
import {
  collectDolphindMigrationSourceDormantState,
  dolphindMigrationLeavesBehind
} from './dolphind-source-dormant-state'
import {
  createDolphindMigrationSourceScope,
  dolphindMigrationOwnerMatchesScope,
  dolphindMigrationPartitionScope,
  type DolphindMigrationSourceScope
} from './dolphind-source-scope'
import { paneBelongsToTabs } from '../../../shared/workspace-session/workspace-session-pane-ownership'

export type DolphindMigrationSourceDependencyCensus = {
  totalCount: number
  counts: Record<DolphindMigrationDependencyKind, number>
  /** Blocker names and remedies where available. */
  names?: Partial<Record<DolphindMigrationDependencyKind, string[]>>
}

export function collectDolphindMigrationUntransferredDependencyCensus(
  state: PersistedState,
  manifest: DolphindMigrationManifest,
  storage?: TerminalScrollbackSnapshotStorage
): DolphindMigrationSourceDependencyCensus {
  const scope = createDolphindMigrationSourceScope({
    source: manifest.source,
    catalog: manifest.payload,
    repos: state.repos
  })
  const sessions = inspectDolphindMigrationSourceSessions(state, {
    hostId: scope.hostId,
    ownerMatches: (ownerKey, partitionHostId) =>
      dolphindMigrationOwnerMatchesScope(
        ownerKey,
        dolphindMigrationPartitionScope(scope, partitionHostId)
      )
  })
  const dormant = collectDolphindMigrationSourceDormantState(
    state,
    manifest.source,
    manifest.payload,
    storage,
    manifest.destinationEnvironmentId
  )
  const counts: Record<DolphindMigrationDependencyKind, number> = {
    ...dormant.blockedCounts,
    'terminal-lease': state.sshRemotePtyLeases.filter(
      (lease) => lease.targetId === scope.targetId && lease.state !== 'terminated'
    ).length,
    // Retained recoveries can stay behind; the terminal gate still requires exit.
    'terminal-recovery': dolphindMigrationLeavesBehind(state, scope.targetId)
      ? 0
      : countTerminalRecoveryState(state, scope, sessions)
  }
  return {
    counts,
    totalCount: DOLPHIND_MIGRATION_DEPENDENCY_KINDS.reduce((total, kind) => total + counts[kind], 0),
    names: {
      ...(dormant.blockedSessionItems.length > 0
        ? { 'workspace-session': dormant.blockedSessionItems }
        : {}),
      ...(dormant.runningAutomationItems.length > 0
        ? { 'automation-run': dormant.runningAutomationItems }
        : {})
    }
  }
}

// The terminal gate proves recovery leases exited; hook aliases add no independent terminal ownership.
function countTerminalRecoveryState(
  state: PersistedState,
  scope: DolphindMigrationSourceScope,
  sessions: DolphindMigrationSourceSessionInspection
): number {
  return state.migrationUnsupportedPtyEntries.filter(
    (entry) =>
      dolphindMigrationOwnerMatchesScope(entry.worktreeId, scope) ||
      (entry.tabId ? sessions.tabIds.has(entry.tabId) : false) ||
      sessions.ptyIds.has(entry.ptyId) ||
      (entry.paneKey ? paneBelongsToTabs(entry.paneKey, sessions.tabIds) : false)
  ).length
}
