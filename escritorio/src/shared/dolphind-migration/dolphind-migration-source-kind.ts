/** Legacy SSH omits source.kind to preserve signed bytes/digests. Other kinds must set kind and omit sshTargetId:
 * older destinations strip unknown fields, then fail parsing instead of importing a non-SSH source as SSH. */
import type {
  DolphindMigrationLocalWslManifestSource,
  DolphindMigrationManifestSource,
  DolphindMigrationSshManifestSource
} from './dolphind-migration-manifest'
import { DOLPHIND_MIGRATION_LOCAL_WSL_SOURCE_RUNTIME_CAPABILITY } from '../dolphind-runtime-capabilities'

export const DOLPHIND_MIGRATION_SSH_RELAY_SOURCE_KIND = 'ssh-relay' as const

/** Non-SSH kinds and the destination capability that proves a destination parses each one. */
export const DOLPHIND_MIGRATION_SOURCE_KIND_CAPABILITIES = {
  'local-wsl': DOLPHIND_MIGRATION_LOCAL_WSL_SOURCE_RUNTIME_CAPABILITY
} as const

export type DolphindMigrationNonSshSourceKind =
  keyof typeof DOLPHIND_MIGRATION_SOURCE_KIND_CAPABILITIES
export type DolphindMigrationSourceKind =
  | typeof DOLPHIND_MIGRATION_SSH_RELAY_SOURCE_KIND
  | DolphindMigrationNonSshSourceKind

export const DOLPHIND_MIGRATION_SOURCE_KIND_UNKNOWN = 'dolphind_migration_source_kind_unknown'

/** A manifest source as it travels: this build may not know every field a newer peer signed. */
export type DolphindMigrationWireSource = Readonly<Record<string, unknown>>

export function dolphindMigrationManifestSourceKind(
  source: DolphindMigrationWireSource
): DolphindMigrationSourceKind {
  if (source.kind === undefined) {
    return DOLPHIND_MIGRATION_SSH_RELAY_SOURCE_KIND
  }
  // An explicit 'ssh-relay' is refused too: SSH has exactly one encoding, so one digest.
  if (isNonSshSourceKind(source.kind)) {
    return source.kind
  }
  throw new Error(DOLPHIND_MIGRATION_SOURCE_KIND_UNKNOWN)
}

function isNonSshSourceKind(kind: unknown): kind is DolphindMigrationNonSshSourceKind {
  return (
    typeof kind === 'string' && Object.hasOwn(DOLPHIND_MIGRATION_SOURCE_KIND_CAPABILITIES, kind)
  )
}

/** The capability a destination must advertise before it may see this source; null for SSH. */
export function requiredDolphindMigrationSourceCapability(
  source: DolphindMigrationWireSource
): string | null {
  const kind = dolphindMigrationManifestSourceKind(source)
  return kind === DOLPHIND_MIGRATION_SSH_RELAY_SOURCE_KIND
    ? null
    : DOLPHIND_MIGRATION_SOURCE_KIND_CAPABILITIES[kind]
}

export function isDolphindMigrationLocalWslSource(
  source: DolphindMigrationManifestSource
): source is DolphindMigrationLocalWslManifestSource {
  return 'kind' in source && source.kind === 'local-wsl'
}

/** For the SSH conversion's own steps: a WSL manifest reaching them is a bug, never a fallback. */
export function requireDolphindMigrationSshSource(
  source: DolphindMigrationManifestSource
): DolphindMigrationSshManifestSource {
  if (isDolphindMigrationLocalWslSource(source)) {
    throw new Error('dolphind_migration_source_not_ssh')
  }
  return source
}
