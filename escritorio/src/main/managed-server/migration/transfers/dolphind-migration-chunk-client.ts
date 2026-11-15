import { parseDolphindMigrationSnapshotChunkResult } from '../../../../shared/dolphind-migration/dolphind-migration-scrollback'
import type {
  DolphindMigrationSnapshotChunkRequest,
  DolphindMigrationSnapshotChunkResult
} from '../../../../shared/dolphind-migration/dolphind-migration-scrollback'

import {
  findUnsupportedMigrationBlobKind,
  dolphindMigrationBlobKindUnsupportedBlocker,
  parseDolphindMigrationBlobChunkResult
} from '../../../../shared/dolphind-migration/dolphind-migration-blob-transfer'

import type {
  DolphindMigrationBlobChunkRequest,
  DolphindMigrationBlobChunkResult
} from '../../../../shared/dolphind-migration/dolphind-migration-blob-transfer'

import { parsePairingCode } from '../../../../shared/remote-runtime/pairing/pairing'
import type { CatalogRequestOptions } from '../catalog/dolphind-migration-request'
import { sendSupportedMigrationRequest } from '../catalog/dolphind-migration-request'

export async function stageRemoteDolphindMigrationSnapshotChunk(
  pairingCode: string,
  request: DolphindMigrationSnapshotChunkRequest,
  options: CatalogRequestOptions = {}
): Promise<DolphindMigrationSnapshotChunkResult> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('dolphind_migration_pairing_code_invalid')
  }
  const response = await sendSupportedMigrationRequest(
    pairing,
    'dolphind.migration.stageSnapshotChunk',
    request,
    options
  )
  if (!response.ok) {
    throw new Error(`dolphind_migration_snapshot_failed:${response.error.message}`)
  }
  return parseDolphindMigrationSnapshotChunkResult(response.result, request)
}

export async function stageRemoteDolphindMigrationBlobChunk(
  pairingCode: string,
  request: DolphindMigrationBlobChunkRequest,
  options: CatalogRequestOptions = {}
): Promise<DolphindMigrationBlobChunkResult> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('dolphind_migration_pairing_code_invalid')
  }
  const response = await sendSupportedMigrationRequest(
    pairing,
    'dolphind.migration.stageBlobChunk',
    request,
    options,
    false,
    null,
    // Recheck every request so a downgraded destination cannot stage an unsupported blob kind.
    (capabilities) => {
      const unsupported = findUnsupportedMigrationBlobKind([request.blob], capabilities)
      if (unsupported) {
        throw new Error(dolphindMigrationBlobKindUnsupportedBlocker(unsupported))
      }
    }
  )
  if (!response.ok) {
    throw new Error(`dolphind_migration_blob_failed:${response.error.message}`)
  }
  return parseDolphindMigrationBlobChunkResult(response.result, request)
}
