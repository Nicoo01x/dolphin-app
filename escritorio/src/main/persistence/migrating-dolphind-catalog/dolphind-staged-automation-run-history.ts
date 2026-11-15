import {
  dolphindMigrationAutomationRunHistoryBlob,
  withDolphindMigrationAutomationRunHistory
} from '../../../shared/dolphind-migration/dolphind-migration-automation-run-history'
import type { DolphindMigrationManifest } from '../../../shared/dolphind-migration/dolphind-migration-manifest'
import { readDolphindMigrationBlob } from './dolphind-migration-blob-staging'

/** The manifest signs the history's digest, so its rows import with the catalog or not at all. */
export function withStagedAutomationRunHistory(
  manifest: DolphindMigrationManifest,
  blobRoot: string
): DolphindMigrationManifest {
  const ref = manifest.payload.dormantState?.automationRunHistory
  if (!ref) {
    return manifest
  }
  const descriptor = dolphindMigrationAutomationRunHistoryBlob(ref)
  return withDolphindMigrationAutomationRunHistory(
    manifest,
    readDolphindMigrationBlob(manifest, blobRoot, descriptor).toString('utf8')
  )
}
