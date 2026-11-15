import type {
  DolphindManagedPendingMigrationRow,
  DolphindManagedRuntimeStatus
} from '../../../../../../shared/dolphind-managed-runtime'
import type { DolphindMigrationBlocker } from '../../../../../../shared/dolphind-migration/dolphind-migration-preflight'
import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'
import { DOLPHIND_UPDATE_WSL_MOVE_RUNNING_CODE } from '../../../../../../shared/wsl-host-types'
import { dependencyKindLabel } from './managed-server-dependency-kinds'

export function migrationPhaseLabel(
  phase: DolphindManagedPendingMigrationRow['phase'],
  t: Translate = translate
): string {
  switch (phase) {
    case 'source-fenced':
      return t('auto.components.settings.managedServers.phase.fenced', 'Host locked')
    case 'destination-staged':
      return t('auto.components.settings.managedServers.phase.staged', 'Copy staged')
    case 'destination-committed':
      return t('auto.components.settings.managedServers.phase.committed', 'Copy committed')
    case 'source-retired':
      return t('auto.components.settings.managedServers.phase.retired', 'Finished')
  }
}

export function recoveryLabel(
  recovery: NonNullable<DolphindManagedRuntimeStatus['recovery']>,
  t: Translate = translate
): string {
  switch (recovery.operation) {
    case 'activate':
      return t(
        'auto.components.settings.managedServers.recovery.activate',
        'An update was interrupted'
      )
    case 'rollback':
      return t(
        'auto.components.settings.managedServers.recovery.rollback',
        'A rollback was interrupted'
      )
    case 'decommission':
      return t(
        'auto.components.settings.managedServers.recovery.decommission',
        'A stop was interrupted'
      )
  }
}

/** `null` counts are unknown, never zero: the server did not answer. */
export function terminalCensusLabel(
  terminals: DolphindManagedRuntimeStatus['terminals'],
  t: Translate = translate
): string {
  if (terminals.liveSessions === null) {
    return t(
      'auto.components.settings.managedServers.terminals.unknown',
      'Running terminals: unknown'
    )
  }
  return t(
    'auto.components.settings.managedServers.terminals.count',
    'Running terminals: {{count}}',
    { count: terminals.liveSessions }
  )
}

/** Copy for Update anyway; it states only what the forced update was verified to keep. */
export function forceUpdateMessage(t: Translate = translate): string {
  return t(
    'auto.components.settings.managedServers.row.forceUpdate',
    'Terminals are running on this host. They keep running through the update, and their panes reconnect when Dolphin’s server restarts.'
  )
}

export function conversionBlockerLabel(blocker: DolphindMigrationBlocker): string {
  switch (blocker.code) {
    case 'dolphind_migration_target_not_found':
      return translate(
        'auto.components.settings.managedServers.blocker.notFound',
        'The SSH host is gone.'
      )
    case 'dolphind_migration_target_owned':
    case 'dolphind_migration_owner_unrecorded':
      return translate(
        'auto.components.settings.managedServers.blocker.owned',
        'Dolphin already runs on this SSH host.'
      )
    case 'dolphind_migration_direct_ssh_repositories':
    case 'dolphind_migration_direct_ssh_folder_workspaces':
      return translate(
        'auto.components.settings.managedServers.blocker.catalog',
        'Projects on this host cannot move yet.'
      )
    case 'dolphind_migration_direct_ssh_terminal_leases':
      return translate(
        'auto.components.settings.managedServers.blocker.terminals',
        'Terminals on this host are still running ({{count}}). Close them first.',
        { count: blocker.terminalLeases.length }
      )
    case 'dolphind_migration_saved_port_forwards':
      return translate(
        'auto.components.settings.managedServers.blocker.portForwards',
        'Saved port forwards stay with the SSH host.'
      )
    case 'dolphind_migration_dependent_state':
      return translate(
        'auto.components.settings.managedServers.blocker.dependents',
        'State that cannot move yet: {{kinds}}.',
        {
          kinds: blocker.dependencies
            .map((dependency) => `${dependencyKindLabel(dependency.kind)} (${dependency.count})`)
            .join(', ')
        }
      )
    case 'dolphind_migration_dependency_unverifiable':
      return translate(
        'auto.components.settings.managedServers.blocker.unverifiable',
        'Dolphin could not read its saved {{sources}}, so it cannot tell what would move.',
        { sources: blocker.sources.map(dependencyKindLabel).join(', ') }
      )
  }
}

// Main's refusal codes, grouped by what the user does next; its English `reason` never reaches UI.
const LIVE_TERMINAL_CODES = new Set([
  'dolphind_initial_runtime_live',
  'dolphind_update_strands_live_terminals',
  'dolphind_update_terminals_running',
  'dolphind_update_ends_in_process_terminals',
  'dolphind_rollback_orphans_live_terminals',
  'dolphind_rollback_strands_live_terminals',
  'dolphind_recovery_orphans_live_terminals',
  'dolphind_stop_still_running'
])
const UNVERIFIABLE_CODES = new Set([
  'dolphind_initial_runtime_unverifiable',
  'dolphind_update_terminal_census_unavailable',
  'dolphind_update_daemon_protocol_unverifiable',
  'dolphind_rollback_active_identity_unverifiable',
  'dolphind_rollback_census_unavailable',
  'dolphind_rollback_daemon_protocol_unverifiable',
  'dolphind_rollback_snapshot_unverifiable',
  'dolphind_recovery_census_required',
  'dolphind_recovery_unverifiable',
  'dolphind_stop_cancel_unverifiable'
])
const MIGRATION_CODES = new Set([
  'dolphind_rollback_migration_in_progress',
  'dolphind_rollback_crosses_migration'
])

export function managedServerOutcomeLabel(
  result: {
    outcome: string
    code?: string
    verdict?: string
  },
  t: Translate = translate
): string {
  const code = result.code ?? ''
  if (code === 'dolphind_stop_active_environment') {
    return t(
      'auto.components.settings.managedServers.outcome.defaultServer',
      'Not done: this server is the default host for new projects. Choose another one under New projects open on before stopping it.'
    )
  }
  if (result.verdict === 'live' || LIVE_TERMINAL_CODES.has(code)) {
    return t(
      'auto.components.settings.managedServers.outcome.live',
      'Not done: terminals on this server are still running. Close them and try again.'
    )
  }
  if (result.verdict === 'unverifiable' || UNVERIFIABLE_CODES.has(code)) {
    return t(
      'auto.components.settings.managedServers.outcome.unverifiable',
      'Not done: Dolphin couldn’t confirm what is running on this server. Try again when the host is reachable.'
    )
  }
  if (code === DOLPHIND_UPDATE_WSL_MOVE_RUNNING_CODE) {
    return t(
      'auto.components.settings.managedServers.outcome.wslMoveRunning',
      'Not done: a project is moving onto this server. Dolphin updates it once the move finishes.'
    )
  }
  if (MIGRATION_CODES.has(code)) {
    return t(
      'auto.components.settings.managedServers.outcome.migration',
      'Not done: a move onto this server is unfinished. Resume it first.'
    )
  }
  if (result.outcome === 'deferred' || result.outcome === 'pending') {
    return t(
      'auto.components.settings.managedServers.outcome.deferred',
      'Not done yet: the server isn’t ready for this. Try again later.'
    )
  }
  return t(
    'auto.components.settings.managedServers.outcome.failed',
    'Dolphin couldn’t finish this on the server. Try again.'
  )
}
