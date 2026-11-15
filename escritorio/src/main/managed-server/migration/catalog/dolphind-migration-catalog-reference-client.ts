import { parseDolphindMigrationCatalogReferenceAbortResult } from '../../../../shared/dolphind-migration/dolphind-migration-catalog-state'
import type {
  DolphindMigrationCatalogReference,
  DolphindMigrationCatalogReferenceAbortResult
} from '../../../../shared/dolphind-migration/dolphind-migration-manifest'
import { DOLPHIND_MIGRATION_CATALOG_ABORT_BY_REFERENCE_RUNTIME_CAPABILITY } from '../../../../shared/dolphind-runtime-capabilities'
import { parsePairingCode } from '../../../../shared/remote-runtime/pairing/pairing'
import type { RuntimeRpcResponse } from '../../../../shared/runtime-rpc-envelope'
import {
  DOLPHIND_MIGRATION_DESTINATION_UNSUPPORTED,
  sendSupportedMigrationRequest,
  type CatalogRequestOptions
} from './dolphind-migration-request'

/** Unlike migration-unsupported, this refusal cannot prove no earlier stage exists. */
export const DOLPHIND_MIGRATION_DESTINATION_ABORT_BY_REFERENCE_UNSUPPORTED =
  'dolphind_migration_destination_abort_by_reference_unsupported:Update Dolphin on this host to cancel this move.'

/** Abort by manifest identity when the full request cannot fit the sealed frame. */
export async function abortRemoteDolphindMigrationCatalogByReference(
  pairingCode: string,
  manifest: DolphindMigrationCatalogReference,
  options: CatalogRequestOptions = {}
): Promise<DolphindMigrationCatalogReferenceAbortResult> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('dolphind_migration_pairing_code_invalid')
  }
  let supportsReference = false
  let response: RuntimeRpcResponse<unknown>
  try {
    response = await sendSupportedMigrationRequest(
      pairing,
      'dolphind.migration.abortCatalogByReference',
      { migrationId: manifest.migrationId, manifestSha256: manifest.manifestSha256 },
      options,
      false,
      null,
      (capabilities) => {
        supportsReference = capabilities.includes(
          DOLPHIND_MIGRATION_CATALOG_ABORT_BY_REFERENCE_RUNTIME_CAPABILITY
        )
        if (!supportsReference) {
          throw new Error(DOLPHIND_MIGRATION_DESTINATION_ABORT_BY_REFERENCE_UNSUPPORTED)
        }
      }
    )
  } catch (error) {
    // A missing method on a host that advertised it proves nothing about what it staged.
    if (
      supportsReference &&
      error instanceof Error &&
      error.message === DOLPHIND_MIGRATION_DESTINATION_UNSUPPORTED
    ) {
      throw new Error(DOLPHIND_MIGRATION_DESTINATION_ABORT_BY_REFERENCE_UNSUPPORTED)
    }
    throw error
  }
  if (!response.ok) {
    throw new Error(`dolphind_migration_abort_failed:${response.error.message}`)
  }
  return parseDolphindMigrationCatalogReferenceAbortResult(response.result, manifest)
}
