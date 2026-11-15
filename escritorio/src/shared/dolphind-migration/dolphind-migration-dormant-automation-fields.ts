import {
  optionalFinite,
  optionalNullableString,
  requiredBoolean,
  requiredFinite,
  requiredRecord,
  requiredString,
  requiredStringOrEmpty
} from './dolphind-migration-dormant-value-validation'

export function parsePrecheck(value: unknown): void {
  if (value === null) {
    return
  }
  const record = requiredRecord(value, 'dolphind_migration_dormant_automation_precheck_invalid')
  requiredString(record.command, 'dolphind_migration_dormant_automation_precheck_command_invalid')
  requiredFinite(
    record.timeoutSeconds,
    'dolphind_migration_dormant_automation_precheck_timeout_invalid'
  )
}

export function parseOutputSnapshot(value: unknown): void {
  if (value === null) {
    return
  }
  const record = requiredRecord(value, 'dolphind_migration_dormant_automation_output_invalid')
  if (record.format !== 'plain_text') {
    throw new Error('dolphind_migration_dormant_automation_output_format_invalid')
  }
  requiredStringOrEmpty(
    record.content,
    'dolphind_migration_dormant_automation_output_content_invalid'
  )
  requiredFinite(record.capturedAt, 'dolphind_migration_dormant_automation_output_time_invalid')
  requiredBoolean(
    record.truncated,
    'dolphind_migration_dormant_automation_output_truncated_invalid'
  )
}

export function parsePrecheckResult(value: unknown): void {
  if (value === null) {
    return
  }
  const record = requiredRecord(
    value,
    'dolphind_migration_dormant_automation_precheck_result_invalid'
  )
  requiredString(
    record.command,
    'dolphind_migration_dormant_automation_precheck_result_command_invalid'
  )
  optionalFinite(
    record.exitCode,
    'dolphind_migration_dormant_automation_precheck_result_exit_invalid',
    true
  )
  requiredBoolean(
    record.timedOut,
    'dolphind_migration_dormant_automation_precheck_result_timeout_invalid'
  )
  requiredFinite(
    record.durationMs,
    'dolphind_migration_dormant_automation_precheck_result_duration_invalid'
  )
  for (const field of ['stdout', 'stderr'] as const) {
    requiredStringOrEmpty(record[field], `dolphind_migration_dormant_automation_${field}_invalid`)
    requiredBoolean(
      record[`${field}Truncated`],
      `dolphind_migration_dormant_automation_${field}_truncated_invalid`
    )
  }
  optionalNullableString(
    record.error,
    'dolphind_migration_dormant_automation_precheck_result_error_invalid'
  )
  requiredFinite(
    record.startedAt,
    'dolphind_migration_dormant_automation_precheck_result_started_invalid'
  )
  requiredFinite(
    record.completedAt,
    'dolphind_migration_dormant_automation_precheck_result_completed_invalid'
  )
}

export function parseUsage(value: unknown): void {
  if (value === null) {
    return
  }
  const record = requiredRecord(value, 'dolphind_migration_dormant_automation_usage_invalid')
  if (record.status !== 'known' && record.status !== 'unavailable') {
    throw new Error('dolphind_migration_dormant_automation_usage_status_invalid')
  }
  for (const field of [
    'inputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheWriteTokens',
    'reasoningOutputTokens',
    'totalTokens',
    'estimatedCostUsd'
  ] as const) {
    optionalFinite(
      record[field],
      `dolphind_migration_dormant_automation_usage_${field}_invalid`,
      true
    )
  }
  requiredFinite(
    record.collectedAt,
    'dolphind_migration_dormant_automation_usage_collected_invalid'
  )
}

export function parseContext(value: unknown, kind: 'workspace-run' | 'task-source'): void {
  if (value === undefined || value === null) {
    return
  }
  const record = requiredRecord(value, 'dolphind_migration_dormant_automation_context_invalid')
  if (record.kind !== kind || record.hostId !== 'local') {
    throw new Error('dolphind_migration_dormant_automation_context_owner_invalid')
  }
  requiredString(record.projectId, 'dolphind_migration_dormant_automation_context_project_invalid')
  optionalNullableString(
    record.projectHostSetupId,
    'dolphind_migration_dormant_automation_context_setup_invalid'
  )
  optionalNullableString(
    record.repoId,
    'dolphind_migration_dormant_automation_context_repo_invalid'
  )
  if (kind === 'workspace-run') {
    requiredString(
      record.projectHostSetupId,
      'dolphind_migration_dormant_automation_context_setup_invalid'
    )
    requiredString(record.repoId, 'dolphind_migration_dormant_automation_context_repo_invalid')
    requiredString(record.path, 'dolphind_migration_dormant_automation_context_path_invalid')
  } else if (!['github', 'gitlab', 'linear', 'jira'].includes(String(record.provider))) {
    throw new Error('dolphind_migration_dormant_automation_context_provider_invalid')
  }
}
