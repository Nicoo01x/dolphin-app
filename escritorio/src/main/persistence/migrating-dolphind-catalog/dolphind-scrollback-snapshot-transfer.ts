import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { DolphindMigrationManifest } from '../../../shared/dolphind-migration/dolphind-migration-manifest'
import {
  decodeDolphindMigrationSnapshotChunk,
  type DolphindMigrationSnapshotChunkRequest,
  type DolphindMigrationSnapshotChunkResult,
  type DolphindMigrationSnapshotUploadState,
  type DolphindMigrationTerminalScrollbackSnapshot
} from '../../../shared/dolphind-migration/dolphind-migration-scrollback'
import { syncDirectoryDurablySync } from '../../filesystem/durable-file-write'
import {
  getTerminalScrollbackSnapshotPath,
  getTerminalScrollbackSnapshotRoot,
  type TerminalScrollbackSnapshotStorage
} from '../../pty/scrollback/terminal-scrollback-snapshots'
import {
  appendDolphindMigrationStagedChunk,
  ensureDolphindMigrationDirectory,
  inspectDolphindMigrationFinalFile,
  linkDolphindMigrationStagedFile,
  dolphindMigrationFileMatches,
  dolphindMigrationStagedFileSize,
  dolphindMigrationStagingDirectory,
  pruneDolphindMigrationStagingDirectories,
  removeDolphindMigrationStagingDirectory,
  requireStagedDolphindMigrationManifest
} from './dolphind-migration-staged-file'

/** Only the staged manifest's snapshots may receive chunks; retried ranges must match. */
export function stageDolphindMigrationSnapshotChunk(args: {
  stagedManifest: DolphindMigrationManifest | null
  storage: TerminalScrollbackSnapshotStorage
  request: DolphindMigrationSnapshotChunkRequest
}): DolphindMigrationSnapshotChunkResult {
  const manifest = requireStagedDolphindMigrationManifest(
    args.stagedManifest,
    args.request,
    'dolphind_migration_snapshot_catalog_not_staged'
  )
  const descriptor = requireDescriptor(manifest, args.request.ref)
  const bytes = decodeDolphindMigrationSnapshotChunk(args.request.bytesBase64)
  ensureDolphindMigrationDirectory(stagingDirectory(args.storage, manifest))
  const acknowledgedOffset = appendDolphindMigrationStagedChunk({
    channel: 'snapshot',
    path: stagedSnapshotPath(args.storage, manifest, descriptor),
    offset: args.request.offset,
    bytes,
    byteLength: descriptor.byteLength
  })
  return {
    migrationId: args.request.migrationId,
    manifestSha256: args.request.manifestSha256,
    ref: args.request.ref,
    acknowledgedOffset
  }
}

export function inspectDolphindMigrationSnapshotUploads(
  manifest: DolphindMigrationManifest,
  storage: TerminalScrollbackSnapshotStorage
): DolphindMigrationSnapshotUploadState[] | undefined {
  const snapshots = manifest.payload.dormantState?.terminalScrollbackSnapshots ?? []
  if (snapshots.length === 0) {
    return undefined
  }
  return snapshots.map((descriptor) => ({
    ...descriptor,
    receivedBytes:
      inspectFinalSnapshot(storage, descriptor) === 'matching'
        ? descriptor.byteLength
        : dolphindMigrationStagedFileSize(
            stagedSnapshotPath(storage, manifest, descriptor),
            descriptor.byteLength
          )
  }))
}

export function assertDolphindMigrationSnapshotsReady(
  manifest: DolphindMigrationManifest,
  storage: TerminalScrollbackSnapshotStorage
): void {
  for (const upload of inspectDolphindMigrationSnapshotUploads(manifest, storage) ?? []) {
    const finalStatus = inspectFinalSnapshot(storage, upload)
    if (finalStatus === 'conflict') {
      throw new Error(`dolphind_migration_snapshot_destination_conflict:${upload.ref}`)
    }
    if (upload.receivedBytes !== upload.byteLength) {
      throw new Error(`dolphind_migration_snapshot_incomplete:${upload.ref}`)
    }
    const path =
      finalStatus === 'matching'
        ? getTerminalScrollbackSnapshotPath(upload.ref, storage)
        : stagedSnapshotPath(storage, manifest, upload)
    if (!path || !dolphindMigrationFileMatches(path, upload)) {
      throw new Error(`dolphind_migration_snapshot_digest_mismatch:${upload.ref}`)
    }
  }
}

export function commitDolphindMigrationSnapshots(
  manifest: DolphindMigrationManifest,
  storage: TerminalScrollbackSnapshotStorage
): void {
  const snapshots = manifest.payload.dormantState?.terminalScrollbackSnapshots ?? []
  assertDolphindMigrationSnapshotsReady(manifest, storage)
  const root = getTerminalScrollbackSnapshotRoot(storage)
  mkdirSync(root, { recursive: true, mode: 0o700 })
  for (const descriptor of snapshots) {
    const finalPath = getTerminalScrollbackSnapshotPath(descriptor.ref, storage)
    if (!finalPath) {
      throw new Error('dolphind_migration_snapshot_ref_invalid')
    }
    linkDolphindMigrationStagedFile({
      stagedPath: stagedSnapshotPath(storage, manifest, descriptor),
      finalPath,
      expected: descriptor,
      conflictError: `dolphind_migration_snapshot_destination_conflict:${descriptor.ref}`
    })
  }
  syncDirectoryDurablySync(root)
  removeDolphindMigrationStagingDirectory(root, manifest)
}

export function abortDolphindMigrationSnapshots(
  manifest: DolphindMigrationManifest,
  storage: TerminalScrollbackSnapshotStorage
): void {
  removeDolphindMigrationStagingDirectory(getTerminalScrollbackSnapshotRoot(storage), manifest)
}

export function pruneDolphindMigrationSnapshotStaging(
  stagedManifests: readonly DolphindMigrationManifest[],
  storage: TerminalScrollbackSnapshotStorage
): void {
  pruneDolphindMigrationStagingDirectories(
    getTerminalScrollbackSnapshotRoot(storage),
    stagedManifests
  )
}

function requireDescriptor(
  manifest: DolphindMigrationManifest,
  ref: string
): DolphindMigrationTerminalScrollbackSnapshot {
  const descriptor = manifest.payload.dormantState?.terminalScrollbackSnapshots?.find(
    (entry) => entry.ref === ref
  )
  if (!descriptor) {
    throw new Error('dolphind_migration_snapshot_unknown')
  }
  return descriptor
}

function inspectFinalSnapshot(
  storage: TerminalScrollbackSnapshotStorage,
  descriptor: DolphindMigrationTerminalScrollbackSnapshot
): 'absent' | 'matching' | 'conflict' {
  return inspectDolphindMigrationFinalFile(
    getTerminalScrollbackSnapshotPath(descriptor.ref, storage),
    descriptor
  )
}

function stagingDirectory(
  storage: TerminalScrollbackSnapshotStorage,
  manifest: DolphindMigrationManifest
): string {
  return dolphindMigrationStagingDirectory(getTerminalScrollbackSnapshotRoot(storage), manifest)
}

function stagedSnapshotPath(
  storage: TerminalScrollbackSnapshotStorage,
  manifest: DolphindMigrationManifest,
  descriptor: DolphindMigrationTerminalScrollbackSnapshot
): string {
  return join(stagingDirectory(storage, manifest), `${descriptor.ref}.${descriptor.sha256}.part`)
}
