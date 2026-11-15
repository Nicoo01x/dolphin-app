import type { DolphindMigrationDormantStatePayload } from './dolphind-migration/dolphind-migration-manifest'
import { getRepoIdFromWorktreeId } from './worktree/id'
import { parseWorkspaceKey } from './workspace-scope'
import {
  assertDolphindMigrationDormantWorkspaceSessionReferences,
  parseDolphindMigrationDormantWorkspaceSession
} from './dolphind-migration/dolphind-migration-dormant-session-validation'
import {
  assertDolphindMigrationDormantAutomationReferences,
  parseDolphindMigrationAutomationRunHistoryRef,
  parseDolphindMigrationDormantAutomationRuns,
  parseDolphindMigrationDormantAutomations
} from './dolphind-migration/dolphind-migration-dormant-automation-validation'
import {
  assertDolphindMigrationScrollbackReferences,
  parseDolphindMigrationTerminalScrollbackSnapshots
} from './dolphind-migration/dolphind-migration-scrollback'
import {
  assertDolphindMigrationClientStateReferences,
  parseDolphindMigrationClientState
} from './dolphind-migration/dolphind-migration-client-state'
import {
  assertUnique,
  boundedArray,
  MAX_DOLPHIND_MIGRATION_DORMANT_NAMESPACES,
  requiredRecord
} from './dolphind-migration/dolphind-migration-dormant-value-validation'
import {
  parseRetiredNames,
  parseRetirementNamespace,
  parseSparsePreset,
  parseWorkspaceLineageEntry,
  parseWorktreeLineageEntry,
  parseWorktreeMetaEntry
} from './dolphind-migration/dolphind-migration-dormant-state-entry-validation'

export {
  MAX_DOLPHIND_MIGRATION_DORMANT_NAMESPACES,
  MAX_DOLPHIND_MIGRATION_DORMANT_ROWS
} from './dolphind-migration/dolphind-migration-dormant-value-validation'

export const DOLPHIND_MIGRATION_DORMANT_STATE_VERSION = 1 as const
export function parseDolphindMigrationDormantState(
  value: unknown
): DolphindMigrationDormantStatePayload {
  const record = requiredRecord(value, 'dolphind_migration_dormant_state_invalid')
  if (record.version !== DOLPHIND_MIGRATION_DORMANT_STATE_VERSION) {
    throw new Error('dolphind_migration_dormant_state_version_unsupported')
  }
  const payload: DolphindMigrationDormantStatePayload = {
    version: DOLPHIND_MIGRATION_DORMANT_STATE_VERSION,
    worktreeMeta: boundedArray(record.worktreeMeta, parseWorktreeMetaEntry, 'worktree_meta'),
    worktreeLineage: boundedArray(
      record.worktreeLineage,
      parseWorktreeLineageEntry,
      'worktree_lineage'
    ),
    workspaceLineage: boundedArray(
      record.workspaceLineage,
      parseWorkspaceLineageEntry,
      'workspace_lineage'
    ),
    sparsePresets: boundedArray(record.sparsePresets, parseSparsePreset, 'sparse_presets'),
    retiredWorktreeNames: boundedArray(
      record.retiredWorktreeNames,
      parseRetiredNames,
      'retired_names'
    ),
    retiredWorktreeNamespaces: boundedArray(
      record.retiredWorktreeNamespaces,
      parseRetirementNamespace,
      'retirement_namespaces',
      MAX_DOLPHIND_MIGRATION_DORMANT_NAMESPACES
    ),
    ...(record.workspaceSession === undefined
      ? {}
      : {
          workspaceSession: parseDolphindMigrationDormantWorkspaceSession(record.workspaceSession)
        }),
    ...(record.terminalScrollbackSnapshots === undefined
      ? {}
      : {
          terminalScrollbackSnapshots: parseDolphindMigrationTerminalScrollbackSnapshots(
            record.terminalScrollbackSnapshots
          )
        }),
    ...(record.automations === undefined
      ? {}
      : { automations: parseDolphindMigrationDormantAutomations(record.automations) }),
    ...(record.automationRuns === undefined
      ? {}
      : { automationRuns: parseDolphindMigrationDormantAutomationRuns(record.automationRuns) }),
    ...(record.automationRunHistory === undefined
      ? {}
      : {
          automationRunHistory: parseDolphindMigrationAutomationRunHistoryRef(
            record.automationRunHistory
          )
        }),
    ...(record.clientState === undefined
      ? {}
      : { clientState: parseDolphindMigrationClientState(record.clientState) })
  }
  if (payload.automationRuns && payload.automationRunHistory) {
    throw new Error('dolphind_migration_dormant_automation_run_history_conflict')
  }
  assertUnique(payload.worktreeMeta, (entry) => entry.worktreeId, 'worktree_meta')
  assertUnique(payload.worktreeMeta, (entry) => entry.sourceKey, 'worktree_meta_source')
  assertUnique(payload.worktreeLineage, (entry) => entry.worktreeId, 'worktree_lineage')
  assertUnique(payload.worktreeLineage, (entry) => entry.sourceKey, 'worktree_lineage_source')
  assertUnique(payload.workspaceLineage, (entry) => entry.childWorkspaceKey, 'workspace_lineage')
  assertUnique(payload.workspaceLineage, (entry) => entry.sourceKey, 'workspace_lineage_source')
  assertUnique(payload.sparsePresets, (entry) => `${entry.repoId}\0${entry.id}`, 'sparse_preset')
  assertUnique(payload.retiredWorktreeNames, (entry) => entry.repoId, 'retired_names')
  assertUnique(
    payload.retiredWorktreeNamespaces,
    (entry) => entry.namespaceKey,
    'retirement_namespace'
  )
  return payload
}

export function assertDolphindMigrationDormantStateReferences(args: {
  dormantState: DolphindMigrationDormantStatePayload
  repositoryIds: ReadonlySet<string>
  folderWorkspaceIds: ReadonlySet<string>
}): void {
  const owns = (value: string): boolean => {
    const parsed = parseWorkspaceKey(value)
    if (parsed?.type === 'folder') {
      return args.folderWorkspaceIds.has(parsed.folderWorkspaceId)
    }
    const worktreeId = parsed?.type === 'worktree' ? parsed.worktreeId : value
    return args.repositoryIds.has(getRepoIdFromWorktreeId(worktreeId))
  }
  for (const entry of args.dormantState.worktreeMeta) {
    if (!owns(entry.worktreeId) || entry.meta.hostId !== 'local') {
      throw new Error('dolphind_migration_dormant_worktree_meta_scope_invalid')
    }
  }
  for (const entry of args.dormantState.worktreeLineage) {
    if (
      entry.worktreeId !== entry.lineage.worktreeId ||
      !owns(entry.worktreeId) ||
      !owns(entry.lineage.parentWorktreeId)
    ) {
      throw new Error('dolphind_migration_dormant_worktree_lineage_scope_invalid')
    }
  }
  for (const entry of args.dormantState.workspaceLineage) {
    if (
      entry.childWorkspaceKey !== entry.lineage.childWorkspaceKey ||
      !owns(entry.childWorkspaceKey) ||
      !owns(entry.lineage.parentWorkspaceKey)
    ) {
      throw new Error('dolphind_migration_dormant_workspace_lineage_scope_invalid')
    }
  }
  for (const preset of args.dormantState.sparsePresets) {
    if (!args.repositoryIds.has(preset.repoId)) {
      throw new Error('dolphind_migration_dormant_sparse_preset_scope_invalid')
    }
  }
  for (const entry of args.dormantState.retiredWorktreeNames) {
    if (!args.repositoryIds.has(entry.repoId)) {
      throw new Error('dolphind_migration_dormant_retired_names_scope_invalid')
    }
  }
  for (const entry of args.dormantState.retiredWorktreeNamespaces) {
    if (
      !entry.namespaceKey.startsWith('local:') ||
      entry.sourceNamespaceKeys.some((key) => !key.startsWith('ssh:'))
    ) {
      throw new Error('dolphind_migration_dormant_retirement_namespace_scope_invalid')
    }
  }
  if (args.dormantState.workspaceSession) {
    assertDolphindMigrationDormantWorkspaceSessionReferences({
      session: args.dormantState.workspaceSession,
      owns,
      repositoryIds: args.repositoryIds
    })
  }
  assertDolphindMigrationScrollbackReferences(
    args.dormantState.workspaceSession,
    args.dormantState.terminalScrollbackSnapshots ?? []
  )
  assertDolphindMigrationDormantAutomationReferences({
    automations: args.dormantState.automations ?? [],
    automationRuns: args.dormantState.automationRuns ?? [],
    owns,
    repositoryIds: args.repositoryIds
  })
  assertDolphindMigrationClientStateReferences({
    clientState: args.dormantState.clientState,
    repositoryIds: args.repositoryIds,
    owns
  })
}
