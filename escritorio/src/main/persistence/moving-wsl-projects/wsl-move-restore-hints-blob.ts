import { createHash } from 'node:crypto'
import type { DolphindMigrationBlobDescriptor } from '../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import { sameDolphindMigrationBlob } from '../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import {
  MAX_DOLPHIND_MIGRATION_TERMINAL_RESTORE_HINTS_BYTES,
  DOLPHIND_MIGRATION_TERMINAL_RESTORE_HINTS_KEY,
  DOLPHIND_MIGRATION_TERMINAL_RESTORE_HINTS_VERSION,
  parseDolphindMigrationTerminalRestoreHintsDocument,
  type DolphindMigrationTerminalRestoreHint
} from '../../../shared/dolphind-migration/dolphind-migration-terminal-restore-hints'
import type { DolphindMigrationBlobSource } from '../../managed-server/migration/transfers/dolphind-migration-blob-coordinator'

export type WslMoveRestoreHintsBlob = {
  descriptor: DolphindMigrationBlobDescriptor
  bytes: Buffer
  source: DolphindMigrationBlobSource
}

/** Omit the blob when there are no hints. */
export function buildWslMoveRestoreHintsBlob(
  hints: readonly DolphindMigrationTerminalRestoreHint[]
): WslMoveRestoreHintsBlob | null {
  if (hints.length === 0) {
    return null
  }
  // Validate before staging so malformed hints fail while the source still owns the move.
  const document = parseDolphindMigrationTerminalRestoreHintsDocument({
    version: DOLPHIND_MIGRATION_TERMINAL_RESTORE_HINTS_VERSION,
    hints: hints.map((hint) => ({ paneKey: hint.paneKey, cwd: hint.cwd }))
  })
  const bytes = Buffer.from(JSON.stringify(document), 'utf8')
  if (bytes.length > MAX_DOLPHIND_MIGRATION_TERMINAL_RESTORE_HINTS_BYTES) {
    throw new Error('dolphind_migration_terminal_restore_hints_too_large')
  }
  const descriptor: DolphindMigrationBlobDescriptor = {
    blobKind: 'terminal-restore-hints',
    key: DOLPHIND_MIGRATION_TERMINAL_RESTORE_HINTS_KEY,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length
  }
  return {
    descriptor,
    bytes,
    source: {
      readChunk: async (requested, offset, maxBytes) => {
        if (!sameDolphindMigrationBlob(requested, descriptor)) {
          throw new Error(`dolphind_migration_source_blob_changed:${requested.blobKind}`)
        }
        return bytes.subarray(offset, offset + maxBytes)
      }
    }
  }
}
