/** Check every blob kind against destination capabilities before uploading. Resume from staged offsets and confirm lost acknowledgements by re-reading state; never assume delivery or silently omit unsupported data. */
import {
  DOLPHIND_MIGRATION_BLOB_CHUNK_BYTES,
  type DolphindMigrationBlobChunkRequest,
  type DolphindMigrationBlobChunkResult,
  type DolphindMigrationBlobDescriptor,
  assertDolphindMigrationBlobSet,
  findUnsupportedMigrationBlobKind,
  dolphindMigrationBlobIdentity,
  dolphindMigrationBlobKindUnsupportedBlocker,
  sameDolphindMigrationBlob
} from '../../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import type {
  DolphindMigrationCatalogState,
  DolphindMigrationManifest
} from '../../../../shared/dolphind-migration/dolphind-migration-manifest'

export type DolphindMigrationBlobSource = {
  /** Return the descriptor's exact hashed bytes at offset, up to maxBytes. */
  readChunk: (
    descriptor: DolphindMigrationBlobDescriptor,
    offset: number,
    maxBytes: number
  ) => Promise<Buffer>
}

export type DolphindMigrationBlobDestination = {
  readCapabilities: () => Promise<readonly string[]>
  readState: (manifest: DolphindMigrationManifest) => Promise<DolphindMigrationCatalogState>
  stageChunk: (
    request: DolphindMigrationBlobChunkRequest
  ) => Promise<DolphindMigrationBlobChunkResult>
}

/** Serve exported bytes, refusing any descriptor they were not exported as. */
export function exportedDolphindMigrationBlobSource(
  blobs: readonly { descriptor: DolphindMigrationBlobDescriptor; bytes: Buffer }[]
): DolphindMigrationBlobSource {
  return {
    readChunk: async (descriptor, offset, maxBytes) => {
      const blob = blobs.find((entry) => sameDolphindMigrationBlob(entry.descriptor, descriptor))
      if (!blob) {
        throw new Error(`dolphind_migration_source_blob_changed:${descriptor.blobKind}`)
      }
      return blob.bytes.subarray(offset, offset + maxBytes)
    }
  }
}

type DolphindMigrationBlobTransfer = {
  source: DolphindMigrationBlobSource
  manifest: DolphindMigrationManifest
  blobs: readonly DolphindMigrationBlobDescriptor[]
  destination: DolphindMigrationBlobDestination
}

type StagedCatalogState = Extract<DolphindMigrationCatalogState, { state: 'staged' }>

export async function transferDolphindMigrationBlobs(
  transfer: DolphindMigrationBlobTransfer
): Promise<void> {
  if (transfer.blobs.length === 0) {
    return
  }
  assertDolphindMigrationBlobSet(transfer.blobs)
  const unsupported = findUnsupportedMigrationBlobKind(
    transfer.blobs,
    await transfer.destination.readCapabilities()
  )
  if (unsupported) {
    throw new Error(dolphindMigrationBlobKindUnsupportedBlocker(unsupported))
  }
  const offsets = receivedOffsets(transfer, await readStagedState(transfer))
  for (const blob of transfer.blobs) {
    let offset = offsets.get(dolphindMigrationBlobIdentity(blob)) ?? 0
    while (offset < blob.byteLength) {
      const bytes = await transfer.source.readChunk(
        blob,
        offset,
        Math.min(DOLPHIND_MIGRATION_BLOB_CHUNK_BYTES, blob.byteLength - offset)
      )
      if (
        bytes.length === 0 ||
        bytes.length > DOLPHIND_MIGRATION_BLOB_CHUNK_BYTES ||
        offset + bytes.length > blob.byteLength
      ) {
        throw new Error(`dolphind_migration_source_blob_changed:${blob.blobKind}`)
      }
      const request: DolphindMigrationBlobChunkRequest = {
        migrationId: transfer.manifest.migrationId,
        manifestSha256: transfer.manifest.manifestSha256,
        blob: { ...blob },
        offset,
        bytesBase64: bytes.toString('base64')
      }
      offset = await stageChunkWithRecovery(transfer, request, offset + bytes.length)
    }
  }
  assertAllReceived(transfer, await readStagedState(transfer))
}

async function readStagedState(
  transfer: DolphindMigrationBlobTransfer
): Promise<StagedCatalogState> {
  const state = await transfer.destination.readState(transfer.manifest)
  if (state.state !== 'staged') {
    throw new Error('dolphind_migration_blob_catalog_not_staged')
  }
  return state
}

function receivedOffsets(
  transfer: DolphindMigrationBlobTransfer,
  state: StagedCatalogState
): Map<string, number> {
  const wanted = new Map(transfer.blobs.map((blob) => [dolphindMigrationBlobIdentity(blob), blob]))
  const offsets = new Map<string, number>()
  for (const upload of state.blobUploads ?? []) {
    const blob = wanted.get(dolphindMigrationBlobIdentity(upload))
    // A reused key with different bytes is another capture; restaging would mix them.
    if (!blob || !sameDolphindMigrationBlob(blob, upload)) {
      throw new Error(`dolphind_migration_blob_descriptor_conflict:${upload.blobKind}`)
    }
    offsets.set(dolphindMigrationBlobIdentity(upload), upload.receivedBytes)
  }
  return offsets
}

function assertAllReceived(
  transfer: DolphindMigrationBlobTransfer,
  state: StagedCatalogState
): void {
  const received = receivedOffsets(transfer, state)
  for (const blob of transfer.blobs) {
    if (received.get(dolphindMigrationBlobIdentity(blob)) !== blob.byteLength) {
      throw new Error(`dolphind_migration_blob_transfer_incomplete:${blob.blobKind}`)
    }
  }
}

async function stageChunkWithRecovery(
  transfer: DolphindMigrationBlobTransfer,
  request: DolphindMigrationBlobChunkRequest,
  expectedOffset: number
): Promise<number> {
  try {
    const result = await transfer.destination.stageChunk(request)
    if (result.receivedBytes !== expectedOffset) {
      throw new Error('dolphind_migration_blob_ack_invalid')
    }
    return result.receivedBytes
  } catch (error) {
    try {
      const observed = await transfer.destination.readState(transfer.manifest)
      const received =
        observed.state === 'staged'
          ? observed.blobUploads?.find(
              (entry) =>
                dolphindMigrationBlobIdentity(entry) === dolphindMigrationBlobIdentity(request.blob)
            )?.receivedBytes
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
