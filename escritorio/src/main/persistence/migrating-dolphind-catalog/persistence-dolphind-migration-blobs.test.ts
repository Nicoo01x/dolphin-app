import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DolphindMigrationBlobDescriptor } from '../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import { getDolphindMigrationReceivedBlobPath } from './dolphind-migration-blob-staging'
import { manifest } from './persistence-dolphind-migration-catalog-fixture'
import { createStore, testState } from '../persistence-test-harness'

vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf-8').slice('encrypted:'.length)
  }
}))

vi.mock('../../telemetry/client', () => ({ track: vi.fn() }))

// Use a blob kind without an installer to isolate channel behavior.
const bytes = Buffer.from('session record one\nsession record two\n')
const blob: DolphindMigrationBlobDescriptor = {
  blobKind: 'agent-session-records',
  key: 'session-kept',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  byteLength: bytes.length
}

function chunk(input: ReturnType<typeof manifest>, offset: number, end: number) {
  return {
    migrationId: input.migrationId,
    manifestSha256: input.manifestSha256,
    blob,
    offset,
    bytesBase64: bytes.subarray(offset, end).toString('base64')
  }
}

function blobRoot(): string {
  return join(testState.dir, 'dolphind-migration-blobs')
}

describe('dolphind migration blobs through the store', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'dolphin-migration-blobs-'))
  })

  afterEach(() => {
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('reloads staged progress from disk and refuses commit until complete', async () => {
    const input = manifest()
    const store = createStore()
    store.stageDolphindMigrationCatalog(input)
    await store.flushPendingOrThrowAsync()
    expect(store.getDolphindMigrationCatalogState(input)).not.toHaveProperty('blobUploads')
    store.stageDolphindMigrationBlobChunk(chunk(input, 0, 8))

    const restarted = createStore()
    expect(restarted.getDolphindMigrationCatalogState(input)).toMatchObject({
      state: 'staged',
      blobUploads: [{ ...blob, receivedBytes: 8 }]
    })
    expect(() => restarted.commitStagedDolphindMigrationCatalog(input)).toThrow(
      `dolphind_migration_blob_incomplete:agent-session-records:${blob.key}`
    )
    expect(restarted.getDolphindMigrationCatalogState(input).state).toBe('staged')

    restarted.stageDolphindMigrationBlobChunk(chunk(input, 8, bytes.length))
    expect(restarted.commitStagedDolphindMigrationCatalog(input).state).toBe('committed')
    expect(readFileSync(getDolphindMigrationReceivedBlobPath(blobRoot(), input, blob))).toEqual(
      bytes
    )
  })
})
