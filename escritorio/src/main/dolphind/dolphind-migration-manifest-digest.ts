import { createHash } from 'node:crypto'
import {
  dolphindMigrationManifestHashInput,
  serializeDolphindMigrationValue,
  type DolphindMigrationManifest
} from '../../shared/dolphind-migration/dolphind-migration-manifest'

export function computeDolphindMigrationManifestSha256(
  manifest: Omit<DolphindMigrationManifest, 'manifestSha256'>
): string {
  return createHash('sha256').update(dolphindMigrationManifestHashInput(manifest)).digest('hex')
}

/** Hash the received manifest: unknown fields from newer peers are part of its signature. */
export function assertDolphindMigrationManifestDigest(manifest: unknown): void {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error('dolphind_migration_manifest_invalid')
  }
  const unsigned = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== 'manifestSha256')
  )
  const digest = createHash('sha256')
    .update(serializeDolphindMigrationValue(unsigned))
    .digest('hex')
  if (!('manifestSha256' in manifest) || digest !== manifest.manifestSha256) {
    throw new Error('dolphind_migration_manifest_digest_mismatch')
  }
}
