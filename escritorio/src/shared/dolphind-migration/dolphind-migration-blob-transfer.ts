/** Opaque migration blobs travel beside the signed catalog. Gate each kind by its destination capability:
 * older destinations drop unknown kinds, so clients must refuse before staging. */
import { z } from 'zod'
import {
  DOLPHIND_MIGRATION_SCROLLBACK_CHUNK_BYTES,
  DolphindMigrationChunkBase64Schema,
  DolphindMigrationDigestSchema,
  DolphindMigrationIdentitySchema,
  decodeDolphindMigrationChunk
} from './dolphind-migration-scrollback'
import { requiredRecord } from './dolphind-migration-dormant-value-validation'
import { assertUniqueKeys } from './dolphind-migration-manifest-fields'
import { DOLPHIND_MIGRATION_BLOB_CHANNEL_RUNTIME_CAPABILITY } from '../dolphind-runtime-capabilities'

export const DOLPHIND_MIGRATION_BLOB_KINDS = [
  'terminal-restore-hints',
  'shell-history',
  'agent-session-records',
  'terminal-history',
  'automation-run-history'
] as const

export type DolphindMigrationBlobKind = (typeof DOLPHIND_MIGRATION_BLOB_KINDS)[number]

type DolphindMigrationBlobKindContract = {
  /** Filename-safe, dot-free and lowercase, so a key is one path segment on any filesystem. */
  key: RegExp
  maxBytes: number
  capability: string
}

const MIB = 1024 * 1024

export const DOLPHIND_MIGRATION_BLOB_KIND_CONTRACTS: Record<
  DolphindMigrationBlobKind,
  DolphindMigrationBlobKindContract
> = {
  // One JSON document per migration; the received directory already scopes it to the migration.
  'terminal-restore-hints': {
    key: /^migration$/,
    maxBytes: 4 * MIB,
    capability: 'dolphind.migration-blob.terminal-restore-hints.v1'
  },
  // `hashWorktreeId` (16 hex) plus the shell whose history file it is.
  'shell-history': {
    key: /^[a-f0-9]{16}-(?:zsh|bash|fish)$/,
    maxBytes: 64 * MIB,
    capability: 'dolphind.migration-blob.shell-history.v1'
  },
  // The agent session id; agent CLIs mint lowercase UUID-like ids.
  'agent-session-records': {
    key: /^[a-z0-9][a-z0-9_-]{0,127}$/,
    maxBytes: 64 * MIB,
    capability: 'dolphind.migration-blob.agent-session-records.v1'
  },
  // 16 hex of the pane key's sha256; the session id it restores as travels inside.
  'terminal-history': {
    key: /^[a-f0-9]{16}$/,
    maxBytes: 16 * MIB,
    capability: 'dolphind.migration-blob.terminal-history.v1'
  },
  // One document per migration; the signed manifest names its digest, and commit imports it.
  'automation-run-history': {
    key: /^migration$/,
    maxBytes: 64 * MIB,
    capability: 'dolphind.migration-blob.automation-run-history.v1'
  }
}

// The same bound the shared chunk decoder enforces for both channels.
export const DOLPHIND_MIGRATION_BLOB_CHUNK_BYTES = DOLPHIND_MIGRATION_SCROLLBACK_CHUNK_BYTES
export const MAX_DOLPHIND_MIGRATION_BLOBS = 1024
export const MAX_DOLPHIND_MIGRATION_BLOB_TOTAL_BYTES = 256 * MIB

/** Byte-for-byte what the destination must hold; empty content is sent as no blob at all. */
export type DolphindMigrationBlobDescriptor = {
  blobKind: DolphindMigrationBlobKind
  key: string
  sha256: string
  byteLength: number
}

export type DolphindMigrationBlobUploadState = DolphindMigrationBlobDescriptor & {
  receivedBytes: number
}

export const DOLPHIND_MIGRATION_DESTINATION_BLOB_KIND_UNSUPPORTED =
  'dolphind_migration_destination_blob_kind_unsupported'

// Windows refuses these as file names whatever the extension, so a key must never be one.
const WINDOWS_RESERVED_FILE_NAME = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i

export const DolphindMigrationBlobDescriptorSchema = z
  .object({
    blobKind: z.enum(DOLPHIND_MIGRATION_BLOB_KINDS),
    key: z.string().max(256),
    sha256: DolphindMigrationDigestSchema,
    byteLength: z.number().int().min(1)
  })
  .superRefine((value, context) => {
    const contract = DOLPHIND_MIGRATION_BLOB_KIND_CONTRACTS[value.blobKind]
    if (!contract.key.test(value.key) || WINDOWS_RESERVED_FILE_NAME.test(value.key)) {
      context.addIssue({
        code: 'custom',
        message: 'dolphind_migration_blob_key_invalid'
      })
    }
    if (value.byteLength > contract.maxBytes) {
      context.addIssue({ code: 'custom', message: 'dolphind_migration_blob_too_large' })
    }
  })

// Not strict: an older host must ignore optional fields a newer client adds.
export const DolphindMigrationBlobChunkRequestSchema = z.object({
  migrationId: DolphindMigrationIdentitySchema,
  manifestSha256: DolphindMigrationDigestSchema,
  blob: DolphindMigrationBlobDescriptorSchema,
  offset: z.number().int().nonnegative().max(MAX_DOLPHIND_MIGRATION_BLOB_TOTAL_BYTES),
  bytesBase64: DolphindMigrationChunkBase64Schema
})

export type DolphindMigrationBlobChunkRequest = z.infer<
  typeof DolphindMigrationBlobChunkRequestSchema
>

export type DolphindMigrationBlobChunkResult = {
  migrationId: string
  manifestSha256: string
  blobKind: DolphindMigrationBlobKind
  key: string
  receivedBytes: number
}

export function parseDolphindMigrationBlobDescriptor(
  value: unknown
): DolphindMigrationBlobDescriptor {
  const parsed = DolphindMigrationBlobDescriptorSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'dolphind_migration_blob_descriptor_invalid')
  }
  return {
    blobKind: parsed.data.blobKind,
    key: parsed.data.key,
    sha256: parsed.data.sha256,
    byteLength: parsed.data.byteLength
  }
}

export function assertDolphindMigrationBlobSet(
  descriptors: readonly DolphindMigrationBlobDescriptor[]
): void {
  if (descriptors.length > MAX_DOLPHIND_MIGRATION_BLOBS) {
    throw new Error('dolphind_migration_blobs_too_many')
  }
  assertUniqueKeys(
    [...descriptors],
    dolphindMigrationBlobIdentity,
    'dolphind_migration_blob_duplicate'
  )
  const total = descriptors.reduce((sum, entry) => sum + entry.byteLength, 0)
  if (total > MAX_DOLPHIND_MIGRATION_BLOB_TOTAL_BYTES) {
    throw new Error('dolphind_migration_blobs_too_large')
  }
}

export function dolphindMigrationBlobIdentity(
  descriptor: Pick<DolphindMigrationBlobDescriptor, 'blobKind' | 'key'>
): string {
  return `${descriptor.blobKind}\0${descriptor.key}`
}

export function sameDolphindMigrationBlob(
  left: DolphindMigrationBlobDescriptor,
  right: DolphindMigrationBlobDescriptor
): boolean {
  return (
    left.blobKind === right.blobKind &&
    left.key === right.key &&
    left.sha256 === right.sha256 &&
    left.byteLength === right.byteLength
  )
}

/** The channel plus each kind's capability; empty when nothing is sent. */
export function requiredMigrationBlobCapabilities(
  descriptors: readonly Pick<DolphindMigrationBlobDescriptor, 'blobKind'>[]
): string[] {
  if (descriptors.length === 0) {
    return []
  }
  const kinds = new Set(descriptors.map((entry) => entry.blobKind))
  return [
    DOLPHIND_MIGRATION_BLOB_CHANNEL_RUNTIME_CAPABILITY,
    ...DOLPHIND_MIGRATION_BLOB_KINDS.filter((kind) => kinds.has(kind)).map(
      (kind) => DOLPHIND_MIGRATION_BLOB_KIND_CONTRACTS[kind].capability
    )
  ]
}

/** The first kind the destination cannot install, so the refusal names what would be lost. */
export function findUnsupportedMigrationBlobKind(
  descriptors: readonly Pick<DolphindMigrationBlobDescriptor, 'blobKind'>[],
  capabilities: readonly string[]
): DolphindMigrationBlobKind | null {
  const advertised = new Set(capabilities)
  for (const descriptor of descriptors) {
    if (
      !advertised.has(DOLPHIND_MIGRATION_BLOB_CHANNEL_RUNTIME_CAPABILITY) ||
      !advertised.has(DOLPHIND_MIGRATION_BLOB_KIND_CONTRACTS[descriptor.blobKind].capability)
    ) {
      return descriptor.blobKind
    }
  }
  return null
}

export function dolphindMigrationBlobKindUnsupportedBlocker(
  kind: DolphindMigrationBlobKind
): string {
  return `${DOLPHIND_MIGRATION_DESTINATION_BLOB_KIND_UNSUPPORTED}:${kind}:Update Dolphin on this host to move this project's ${kind} to it.`
}

export function decodeDolphindMigrationBlobChunk(bytesBase64: string): Buffer {
  return decodeDolphindMigrationChunk(bytesBase64, 'dolphind_migration_blob_chunk_invalid')
}

/** Absent on hosts that predate blobs or hold none staged; both mean every blob starts at 0. */
export function parseDolphindMigrationBlobUploadStates(
  value: unknown
): DolphindMigrationBlobUploadState[] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value) || value.length > MAX_DOLPHIND_MIGRATION_BLOBS) {
    throw new Error('dolphind_migration_blob_state_invalid')
  }
  const uploads = value.map((entry) => {
    // Fails closed on an unknown kind by design: only blobs this desktop staged can appear here.
    const record = requiredRecord(entry, 'dolphind_migration_blob_state_invalid')
    const descriptor = parseDolphindMigrationBlobDescriptor(record)
    if (
      !Number.isSafeInteger(record.receivedBytes) ||
      Number(record.receivedBytes) < 0 ||
      Number(record.receivedBytes) > descriptor.byteLength
    ) {
      throw new Error('dolphind_migration_blob_state_invalid')
    }
    return { ...descriptor, receivedBytes: Number(record.receivedBytes) }
  })
  assertDolphindMigrationBlobSet(uploads)
  return uploads
}

export function parseDolphindMigrationBlobChunkResult(
  value: unknown,
  request: DolphindMigrationBlobChunkRequest
): DolphindMigrationBlobChunkResult {
  const record = requiredRecord(value, 'dolphind_migration_blob_chunk_result_invalid')
  const receivedBytes =
    request.offset + decodeDolphindMigrationBlobChunk(request.bytesBase64).length
  if (
    record.migrationId !== request.migrationId ||
    record.manifestSha256 !== request.manifestSha256 ||
    record.blobKind !== request.blob.blobKind ||
    record.key !== request.blob.key ||
    record.receivedBytes !== receivedBytes
  ) {
    throw new Error('dolphind_migration_blob_chunk_result_invalid')
  }
  return {
    migrationId: request.migrationId,
    manifestSha256: request.manifestSha256,
    blobKind: request.blob.blobKind,
    key: request.blob.key,
    receivedBytes
  }
}

/** Kinds this build's destination accepts: installed after commit, or imported by the commit itself. */
export const DOLPHIND_MIGRATION_INSTALLABLE_BLOB_KINDS: readonly DolphindMigrationBlobKind[] = [
  'terminal-restore-hints',
  'shell-history',
  'terminal-history',
  'automation-run-history'
]

/** Moved panes' terminal history installs only on a WSL host, the one destination a WSL move has. */
export function advertisedDolphindMigrationBlobCapabilities(host: { wslHost: boolean }): string[] {
  return [
    DOLPHIND_MIGRATION_BLOB_CHANNEL_RUNTIME_CAPABILITY,
    ...DOLPHIND_MIGRATION_INSTALLABLE_BLOB_KINDS.filter(
      (kind) => kind !== 'terminal-history' || host.wslHost
    ).map((kind) => DOLPHIND_MIGRATION_BLOB_KIND_CONTRACTS[kind].capability)
  ]
}
