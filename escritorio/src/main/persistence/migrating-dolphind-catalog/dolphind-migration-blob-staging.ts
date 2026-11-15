// The manifest omits blobs; descriptor filenames make staged uploads resumable after restart.
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  DOLPHIND_MIGRATION_BLOB_KINDS,
  assertDolphindMigrationBlobSet,
  decodeDolphindMigrationBlobChunk,
  dolphindMigrationBlobIdentity,
  parseDolphindMigrationBlobDescriptor,
  sameDolphindMigrationBlob,
  type DolphindMigrationBlobChunkRequest,
  type DolphindMigrationBlobChunkResult,
  type DolphindMigrationBlobDescriptor,
  type DolphindMigrationBlobKind,
  type DolphindMigrationBlobUploadState
} from '../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import type { DolphindMigrationManifest } from '../../../shared/dolphind-migration/dolphind-migration-manifest'
import { syncDirectoryDurablySync } from '../../filesystem/durable-file-write'
import {
  appendDolphindMigrationStagedChunk,
  ensureDolphindMigrationDirectory,
  inspectDolphindMigrationFinalFile,
  linkDolphindMigrationStagedFile,
  dolphindMigrationFileMatches,
  dolphindMigrationStagedFileSize,
  dolphindMigrationStagingDirectory,
  dolphindMigrationStagingKey,
  pruneDolphindMigrationKeyedDirectories,
  pruneDolphindMigrationStagingDirectories,
  removeDolphindMigrationStagingDirectory,
  requireStagedDolphindMigrationManifest,
  type DolphindMigrationRequestIdentity
} from './dolphind-migration-staged-file'

const RECEIVED_DIRECTORY = 'received'
const STAGED_BLOB_NAME = /^([^.]+)\.([a-f0-9]{64})\.([1-9][0-9]*)\.part$/

type DolphindMigrationBlobName = Pick<DolphindMigrationBlobDescriptor, 'blobKind' | 'key'>

type ReceivedBlobPathResolver = (
  root: string,
  manifest: DolphindMigrationRequestIdentity,
  descriptor: DolphindMigrationBlobName
) => string

const receivedDirectoryPath: ReceivedBlobPathResolver = (root, manifest, descriptor) =>
  join(receivedBlobsDirectory(root, manifest), descriptor.blobKind, descriptor.key)

const RECEIVED_BLOB_DESTINATIONS: Record<DolphindMigrationBlobKind, ReceivedBlobPathResolver> = {
  'terminal-restore-hints': receivedDirectoryPath,
  'shell-history': receivedDirectoryPath,
  'agent-session-records': receivedDirectoryPath,
  'terminal-history': receivedDirectoryPath,
  'automation-run-history': receivedDirectoryPath
}

export function getDolphindMigrationReceivedBlobPath(
  root: string,
  manifest: DolphindMigrationRequestIdentity,
  descriptor: DolphindMigrationBlobName
): string {
  return RECEIVED_BLOB_DESTINATIONS[descriptor.blobKind](root, manifest, descriptor)
}

export function listDolphindMigrationReceivedBlobNames(
  root: string,
  manifest: DolphindMigrationRequestIdentity,
  blobKind: DolphindMigrationBlobKind
): string[] {
  return readDirectory(join(receivedBlobsDirectory(root, manifest), blobKind))
}

export type DolphindMigrationBlobChunkStaging = {
  stagedManifest: DolphindMigrationManifest | null
  root: string
  request: DolphindMigrationBlobChunkRequest
}

export function stageDolphindMigrationBlobChunk(
  args: DolphindMigrationBlobChunkStaging
): DolphindMigrationBlobChunkResult {
  const manifest = requireStagedDolphindMigrationManifest(
    args.stagedManifest,
    args.request,
    'dolphind_migration_blob_catalog_not_staged'
  )
  const descriptor = parseDolphindMigrationBlobDescriptor(args.request.blob)
  const bytes = decodeDolphindMigrationBlobChunk(args.request.bytesBase64)
  const staged = stagedBlobDescriptors(args.root, manifest)
  const existing = staged.find(
    (entry) => dolphindMigrationBlobIdentity(entry) === dolphindMigrationBlobIdentity(descriptor)
  )
  if (existing && !sameDolphindMigrationBlob(existing, descriptor)) {
    // Replacing staged bytes requires abort and restage.
    throw new Error(`dolphind_migration_blob_descriptor_conflict:${descriptor.blobKind}`)
  }
  if (!existing) {
    assertDolphindMigrationBlobSet([...staged, descriptor])
  }
  const path = stagedBlobPath(args.root, manifest, descriptor)
  ensureDolphindMigrationDirectory(dirname(path))
  const receivedBytes = appendDolphindMigrationStagedChunk({
    channel: 'blob',
    path,
    offset: args.request.offset,
    bytes,
    byteLength: descriptor.byteLength
  })
  return {
    migrationId: args.request.migrationId,
    manifestSha256: args.request.manifestSha256,
    blobKind: descriptor.blobKind,
    key: descriptor.key,
    receivedBytes
  }
}

export function inspectDolphindMigrationBlobUploads(
  manifest: DolphindMigrationManifest,
  root: string
): DolphindMigrationBlobUploadState[] | undefined {
  const uploads = stagedBlobDescriptors(root, manifest).map((descriptor) => ({
    ...descriptor,
    receivedBytes:
      inspectReceivedBlob(root, manifest, descriptor) === 'matching'
        ? descriptor.byteLength
        : dolphindMigrationStagedFileSize(
            stagedBlobPath(root, manifest, descriptor),
            descriptor.byteLength
          )
  }))
  return uploads.length > 0 ? uploads : undefined
}

export function assertDolphindMigrationBlobsReady(
  manifest: DolphindMigrationManifest,
  root: string
): void {
  for (const upload of inspectDolphindMigrationBlobUploads(manifest, root) ?? []) {
    const label = `${upload.blobKind}:${upload.key}`
    const finalStatus = inspectReceivedBlob(root, manifest, upload)
    if (finalStatus === 'conflict') {
      throw new Error(`dolphind_migration_blob_destination_conflict:${label}`)
    }
    if (upload.receivedBytes !== upload.byteLength) {
      throw new Error(`dolphind_migration_blob_incomplete:${label}`)
    }
    if (
      finalStatus !== 'matching' &&
      !dolphindMigrationFileMatches(stagedBlobPath(root, manifest, upload), upload)
    ) {
      throw new Error(`dolphind_migration_blob_digest_mismatch:${label}`)
    }
  }
}

/** Verified staged files; call after assertDolphindMigrationBlobsReady in the same synchronous turn. */
export function stagedDolphindMigrationBlobFiles(
  manifest: DolphindMigrationManifest,
  root: string
): { descriptor: DolphindMigrationBlobDescriptor; path: string }[] {
  return stagedBlobDescriptors(root, manifest).map((descriptor) => ({
    descriptor,
    path: stagedBlobPath(root, manifest, descriptor)
  }))
}

/** A blob's verified bytes, staged or already moved to received by an earlier commit attempt. */
export function readDolphindMigrationBlob(
  manifest: DolphindMigrationManifest,
  root: string,
  descriptor: DolphindMigrationBlobDescriptor
): Buffer {
  for (const path of [
    stagedBlobPath(root, manifest, descriptor),
    getDolphindMigrationReceivedBlobPath(root, manifest, descriptor)
  ]) {
    if (dolphindMigrationFileMatches(path, descriptor)) {
      return readFileSync(path)
    }
  }
  throw new Error(`dolphind_migration_blob_incomplete:${descriptor.blobKind}:${descriptor.key}`)
}

/** Reject missing or extra blobs, including leftovers from another capture. */
export function assertDolphindMigrationBlobSetMatches(
  manifest: DolphindMigrationManifest,
  root: string,
  expected: readonly DolphindMigrationBlobDescriptor[]
): void {
  assertDolphindMigrationBlobSet(expected)
  const wanted = new Map(expected.map((entry) => [dolphindMigrationBlobIdentity(entry), entry]))
  const staged = stagedBlobDescriptors(root, manifest)
  const stagedIds = new Set(staged.map(dolphindMigrationBlobIdentity))
  for (const descriptor of staged) {
    const match = wanted.get(dolphindMigrationBlobIdentity(descriptor))
    if (!match || !sameDolphindMigrationBlob(match, descriptor)) {
      throw blobSetMismatch(descriptor)
    }
  }
  for (const identity of receivedBlobIdentities(root, manifest)) {
    if (!wanted.has(identity)) {
      throw new Error('dolphind_migration_blob_set_mismatch')
    }
  }
  for (const descriptor of expected) {
    // Previous commit attempts may have moved these bytes to received.
    if (
      !stagedIds.has(dolphindMigrationBlobIdentity(descriptor)) &&
      inspectReceivedBlob(root, manifest, descriptor) !== 'matching'
    ) {
      throw blobSetMismatch(descriptor)
    }
  }
}

/** Call assertDolphindMigrationBlobsReady in the same synchronous turn so no chunk can change verified bytes. */
export function commitDolphindMigrationBlobs(manifest: DolphindMigrationManifest, root: string): void {
  const directories = new Set<string>()
  for (const descriptor of stagedBlobDescriptors(root, manifest)) {
    const finalPath = getDolphindMigrationReceivedBlobPath(root, manifest, descriptor)
    ensureDolphindMigrationDirectory(dirname(finalPath))
    linkDolphindMigrationStagedFile({
      stagedPath: stagedBlobPath(root, manifest, descriptor),
      finalPath,
      expected: descriptor,
      conflictError: `dolphind_migration_blob_destination_conflict:${descriptor.blobKind}:${descriptor.key}`
    })
    directories.add(dirname(finalPath))
  }
  for (const directory of directories) {
    syncDirectoryDurablySync(directory)
  }
  removeDolphindMigrationStagingDirectory(root, manifest)
}

/** Also remove blobs moved by a commit that never landed. */
export function abortDolphindMigrationBlobs(manifest: DolphindMigrationManifest, root: string): void {
  removeDolphindMigrationStagingDirectory(root, manifest)
  rmSync(receivedBlobsDirectory(root, manifest), { recursive: true, force: true })
}

export function pruneDolphindMigrationBlobStaging(
  stagedManifests: readonly DolphindMigrationManifest[],
  committedMigrations: readonly DolphindMigrationRequestIdentity[],
  root: string
): void {
  pruneDolphindMigrationStagingDirectories(root, stagedManifests)
  pruneDolphindMigrationKeyedDirectories(join(root, RECEIVED_DIRECTORY), [
    ...stagedManifests,
    ...committedMigrations
  ])
}

function blobSetMismatch(descriptor: DolphindMigrationBlobDescriptor): Error {
  return new Error(`dolphind_migration_blob_set_mismatch:${descriptor.blobKind}:${descriptor.key}`)
}

function receivedBlobIdentities(root: string, manifest: DolphindMigrationManifest): string[] {
  const received = receivedBlobsDirectory(root, manifest)
  return DOLPHIND_MIGRATION_BLOB_KINDS.flatMap((blobKind) =>
    readDirectory(join(received, blobKind)).map((key) =>
      dolphindMigrationBlobIdentity({ blobKind, key })
    )
  )
}

function stagedBlobDescriptors(
  root: string,
  manifest: DolphindMigrationManifest
): DolphindMigrationBlobDescriptor[] {
  const staging = dolphindMigrationStagingDirectory(root, manifest)
  const descriptors: DolphindMigrationBlobDescriptor[] = []
  for (const blobKind of DOLPHIND_MIGRATION_BLOB_KINDS) {
    for (const name of readDirectory(join(staging, blobKind))) {
      const match = STAGED_BLOB_NAME.exec(name)
      if (!match) {
        continue
      }
      try {
        descriptors.push(
          parseDolphindMigrationBlobDescriptor({
            blobKind,
            key: match[1],
            sha256: match[2],
            byteLength: Number(match[3])
          })
        )
      } catch {
        // Foreign names cannot belong to the staged set.
      }
    }
  }
  return descriptors
}

function readDirectory(path: string): string[] {
  try {
    return readdirSync(path).sort()
  } catch {
    return []
  }
}

function inspectReceivedBlob(
  root: string,
  manifest: DolphindMigrationManifest,
  descriptor: DolphindMigrationBlobDescriptor
): 'absent' | 'matching' | 'conflict' {
  return inspectDolphindMigrationFinalFile(
    getDolphindMigrationReceivedBlobPath(root, manifest, descriptor),
    descriptor
  )
}

function receivedBlobsDirectory(root: string, manifest: DolphindMigrationRequestIdentity): string {
  return join(root, RECEIVED_DIRECTORY, dolphindMigrationStagingKey(manifest))
}

function stagedBlobPath(
  root: string,
  manifest: DolphindMigrationManifest,
  descriptor: DolphindMigrationBlobDescriptor
): string {
  return join(
    dolphindMigrationStagingDirectory(root, manifest),
    descriptor.blobKind,
    `${descriptor.key}.${descriptor.sha256}.${descriptor.byteLength}.part`
  )
}
