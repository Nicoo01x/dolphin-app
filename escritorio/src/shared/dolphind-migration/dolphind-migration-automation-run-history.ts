/** Finished automation runs travel as one blob; the signed manifest carries only its digest, so run
 * history never bounds the manifest. Format changes require a new capability. */
import type { AutomationRun } from '../automations/history/automation-run'
import type { DolphindMigrationBlobDescriptor } from './dolphind-migration-blob-transfer'
import {
  serializeDolphindMigrationValue,
  type DolphindMigrationAutomationRunHistoryRef,
  type DolphindMigrationManifest
} from './dolphind-migration-manifest'
import { parseDolphindMigrationCatalogPayload } from './dolphind-migration-manifest-validation'
import { requiredRecord } from './dolphind-migration-dormant-value-validation'

const DOLPHIND_MIGRATION_AUTOMATION_RUN_HISTORY_VERSION = 1

/** Canonical, so a re-export of an unchanged source reproduces the journaled digest. */
export function serializeDolphindMigrationAutomationRunHistory(
  runs: readonly AutomationRun[]
): string {
  return serializeDolphindMigrationValue({
    version: DOLPHIND_MIGRATION_AUTOMATION_RUN_HISTORY_VERSION,
    runs
  })
}

export function dolphindMigrationAutomationRunHistoryBlob(
  ref: DolphindMigrationAutomationRunHistoryRef
): DolphindMigrationBlobDescriptor {
  return { blobKind: 'automation-run-history', key: 'migration', ...ref }
}

/** Blobs the manifest itself names; its commit is refused until they are staged. */
export function dolphindMigrationManifestBlobs(
  manifest: Pick<DolphindMigrationManifest, 'payload'>
): DolphindMigrationBlobDescriptor[] {
  const ref = manifest.payload.dormantState?.automationRunHistory
  return ref ? [dolphindMigrationAutomationRunHistoryBlob(ref)] : []
}

/** The manifest with its runs inline, validated against its own catalog as inline runs would be. */
export function withDolphindMigrationAutomationRunHistory<
  T extends Pick<DolphindMigrationManifest, 'payload'>
>(manifest: T, text: string): T {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    throw new Error('dolphind_migration_automation_run_history_invalid')
  }
  const record = requiredRecord(document, 'dolphind_migration_automation_run_history_invalid')
  if (record.version !== DOLPHIND_MIGRATION_AUTOMATION_RUN_HISTORY_VERSION) {
    throw new Error('dolphind_migration_automation_run_history_version_unsupported')
  }
  const { automationRunHistory: _ref, ...dormantState } = manifest.payload.dormantState ?? {}
  return {
    ...manifest,
    payload: parseDolphindMigrationCatalogPayload({
      ...manifest.payload,
      dormantState: { ...dormantState, automationRuns: record.runs }
    })
  }
}
