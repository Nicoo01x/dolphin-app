/** Read snapshot chunks from source storage and verify manifest length/digest. Resume from destination offsets; re-read after lost acknowledgements instead of assuming delivery. This transport-independent driver retires nothing. */
import type {
  DolphindMigrationCatalogState,
  DolphindMigrationManifest
} from '../../../../shared/dolphind-migration/dolphind-migration-manifest'
import {
  decodeDolphindMigrationSnapshotChunk,
  type DolphindMigrationSnapshotChunkRequest,
  type DolphindMigrationSnapshotChunkResult
} from '../../../../shared/dolphind-migration/dolphind-migration-scrollback'
import type { Store } from '../../../persistence/loading-store/store'

export type DolphindMigrationSnapshotSource = Pick<
  Store,
  'readDolphindMigrationSourceSnapshotChunk'
>

type DolphindMigrationSnapshotDestination = {
  readState: (manifest: DolphindMigrationManifest) => Promise<DolphindMigrationCatalogState>
  stageChunk: (
    request: DolphindMigrationSnapshotChunkRequest
  ) => Promise<DolphindMigrationSnapshotChunkResult>
}

export async function transferDolphindMigrationSnapshots(args: {
  source: DolphindMigrationSnapshotSource
  manifest: DolphindMigrationManifest
  state: Extract<DolphindMigrationCatalogState, { state: 'staged' }>
  destination: DolphindMigrationSnapshotDestination
}): Promise<void> {
  const snapshots = args.manifest.payload.dormantState?.terminalScrollbackSnapshots ?? []
  if (snapshots.length === 0) {
    return
  }
  // Journal retention keeps bytes available after tab close, including retries.
  await sendSnapshots(args, snapshots)
}

async function sendSnapshots(
  args: Parameters<typeof transferDolphindMigrationSnapshots>[0],
  snapshots: NonNullable<
    NonNullable<DolphindMigrationManifest['payload']['dormantState']>['terminalScrollbackSnapshots']
  >
): Promise<void> {
  const offsets = new Map(
    (args.state.snapshotUploads ?? []).map((entry) => [entry.ref, entry.receivedBytes])
  )
  for (const snapshot of snapshots) {
    let offset = offsets.get(snapshot.ref)
    if (offset === undefined) {
      throw new Error('dolphind_migration_snapshot_transfer_unsupported')
    }
    while (offset < snapshot.byteLength) {
      const chunk = args.source.readDolphindMigrationSourceSnapshotChunk(
        args.manifest,
        snapshot.ref,
        offset
      )
      if (chunk.totalBytes !== snapshot.byteLength || !chunk.bytesBase64) {
        throw new Error('dolphind_migration_source_snapshot_changed')
      }
      const request: DolphindMigrationSnapshotChunkRequest = {
        migrationId: args.manifest.migrationId,
        manifestSha256: args.manifest.manifestSha256,
        ref: snapshot.ref,
        offset,
        bytesBase64: chunk.bytesBase64
      }
      const expectedOffset = offset + decodeDolphindMigrationSnapshotChunk(chunk.bytesBase64).length
      offset = await stageChunkWithRecovery(args, request, expectedOffset)
    }
  }
  const verified = await args.destination.readState(args.manifest)
  if (
    verified.state !== 'staged' ||
    (verified.snapshotUploads ?? []).length !== snapshots.length ||
    (verified.snapshotUploads ?? []).some((entry) => entry.receivedBytes !== entry.byteLength)
  ) {
    throw new Error('dolphind_migration_snapshot_transfer_incomplete')
  }
}

async function stageChunkWithRecovery(
  args: { manifest: DolphindMigrationManifest; destination: DolphindMigrationSnapshotDestination },
  request: DolphindMigrationSnapshotChunkRequest,
  expectedOffset: number
): Promise<number> {
  try {
    const result = await args.destination.stageChunk(request)
    if (result.acknowledgedOffset !== expectedOffset) {
      throw new Error('dolphind_migration_snapshot_ack_invalid')
    }
    return result.acknowledgedOffset
  } catch (error) {
    try {
      const observed = await args.destination.readState(args.manifest)
      const received =
        observed.state === 'staged'
          ? observed.snapshotUploads?.find((entry) => entry.ref === request.ref)?.receivedBytes
          : undefined
      if (received === expectedOffset) {
        return received
      }
    } catch {
      // Unverifiable chunks retain the original failure.
    }
    throw error
  }
}
