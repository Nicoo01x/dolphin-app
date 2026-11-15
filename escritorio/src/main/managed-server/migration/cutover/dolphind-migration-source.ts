/** Expose fenced-source checks/release through the cutover port; conversion owns terminal assessment, export and fence acquisition. */
import type { DolphindMigrationSourceKind } from '../../../../shared/dolphind-migration/dolphind-migration-source-kind'
import type {
  DolphindMigrationCatalogPayload,
  DolphindMigrationManifest
} from '../../../../shared/dolphind-migration/dolphind-migration-manifest'
import type { DolphindMigrationSourceCutover } from '../../../../shared/dolphind-migration/dolphind-migration-source-cutover'
import type {
  DolphindMigrationExportedBlob,
  DolphindMigrationManifestExportOptions
} from '../../../persistence/migrating-dolphind-catalog/dolphind-migration-manifest-export'
import type {
  DolphindMigrationFenceResult,
  DolphindMigrationFenceState
} from '../../../ssh/migration-source/dolphind-migration-source-fence'
import type { DolphindMigrationTerminalVerdict } from '../../../ssh/migration-source/dolphind-migration-terminal-gate'

export type DolphindMigrationSourceCutoverPort = {
  /** Before every stage and commit; throws unless the fenced source still matches the journal.
   * Returns the bytes of the blobs its manifest names, which that match proves are the journaled ones. */
  verifyFence: (cutover: DolphindMigrationSourceCutover) => DolphindMigrationExportedBlob[]
  /** Drops the fence, then the journal; only on proof the destination holds nothing. */
  releaseFence: (cutover: DolphindMigrationSourceCutover) => Promise<void>
}

type DolphindMigrationFenceAcquireArgs = {
  destinationEnvironmentId: string
  destinationName: string
  terminalProof: DolphindMigrationTerminalVerdict
  now?: () => Date
  signal?: AbortSignal
}

export type DolphindMigrationSource = DolphindMigrationSourceCutoverPort & {
  readonly kind: DolphindMigrationSourceKind
  readonly journalKey: string
  collectCatalog: () => DolphindMigrationCatalogPayload
  /** Rewrite paths before signing; export must not mutate source. */
  exportManifest: (options?: DolphindMigrationManifestExportOptions) => DolphindMigrationManifest
  /** Before the fence. Loss of contact is `unverifiable`, never `exited`. */
  assessTerminals: () => Promise<DolphindMigrationTerminalVerdict>
  retireProvenExitedTerminals: (proof: DolphindMigrationTerminalVerdict) => void
  /** Throws when the journal cannot be read: an unreadable record keeps the source fenced. */
  resolveFence: () => DolphindMigrationFenceState
  /** Journal, then fence, then flush, then the terminal re-check under the fence. */
  acquireFence: (args: DolphindMigrationFenceAcquireArgs) => Promise<DolphindMigrationFenceResult>
}
