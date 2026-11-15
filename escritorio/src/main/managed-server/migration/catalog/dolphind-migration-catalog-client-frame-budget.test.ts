import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DolphindMigrationBlobDescriptor } from '../../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import type { DolphindMigrationManifest } from '../../../../shared/dolphind-migration/dolphind-migration-manifest'
import {
  MAX_DOLPHIND_MIGRATION_MANIFEST_BYTES,
  DOLPHIND_MIGRATION_MANIFEST_VERSION
} from '../../../../shared/dolphind-migration/dolphind-migration-manifest-validation'
import {
  DOLPHIND_MIGRATION_BLOB_CHANNEL_RUNTIME_CAPABILITY,
  DOLPHIND_MIGRATION_CATALOG_RUNTIME_CAPABILITY
} from '../../../../shared/dolphind-runtime-capabilities'
import { encodePairingOffer } from '../../../../shared/remote-runtime/pairing/pairing'
import { PAIRING_OFFER_VERSION } from '../../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'

const sendRequest = vi.hoisted(() => vi.fn())
const extraCapabilities = vi.hoisted((): string[] => [])
vi.mock('../../../../shared/remote-runtime/requests/remote-runtime-request-socket', () => ({
  sendRemoteRuntimeRequestOnSocket: async (
    pairing: unknown,
    method: string,
    params: unknown,
    _timeoutMs: number,
    _envelope: unknown,
    validate: (response: unknown) => void
  ) => {
    validate({
      ok: true,
      _meta: { runtimeId: 'runtime' },
      result: {
        capabilities: [
          DOLPHIND_MIGRATION_CATALOG_RUNTIME_CAPABILITY,
          DOLPHIND_MIGRATION_BLOB_CHANNEL_RUNTIME_CAPABILITY,
          'dolphind.migration-blob.agent-session-records.v1',
          ...extraCapabilities
        ]
      }
    })
    return sendRequest(pairing, method, params)
  }
}))

const { commitRemoteDolphindMigrationCatalog, stageRemoteDolphindMigrationCatalog } =
  await import('./dolphind-migration-catalog-client')

const pairingCode = encodePairingOffer({
  v: PAIRING_OFFER_VERSION,
  endpoint: 'ws://127.0.0.1:46768/runtime',
  deviceToken: 'device-token',
  publicKeyB64: 'public-key',
  pairedDeviceId: 'paired-desktop'
})

function manifestOfBytes(bytes: number): DolphindMigrationManifest {
  const withLabel = (targetLabel: string): DolphindMigrationManifest => ({
    version: DOLPHIND_MIGRATION_MANIFEST_VERSION,
    migrationId: 'migration-frame',
    createdAt: '2026-10-18T12:00:00.000Z',
    source: { sshTargetId: 'source', sshTargetGeneration: 1, targetLabel },
    payload: { repositories: [], projectGroups: [], folderWorkspaces: [] },
    manifestSha256: 'a'.repeat(64)
  })
  return withLabel('x'.repeat(bytes - JSON.stringify(withLabel('')).length))
}

const manyBlobs: DolphindMigrationBlobDescriptor[] = Array.from({ length: 200 }, (_, index) => ({
  blobKind: 'agent-session-records',
  key: `session-${index}-${'s'.repeat(64)}`,
  sha256: 'c'.repeat(64),
  byteLength: 1024
}))

beforeEach(() => {
  vi.clearAllMocks()
  extraCapabilities.length = 0
  sendRequest.mockResolvedValue({
    ok: true,
    _meta: { runtimeId: 'runtime' },
    result: {
      state: 'staged',
      migrationId: 'migration-frame',
      manifestSha256: 'a'.repeat(64),
      stagedAt: '2026-10-18T12:00:00.000Z'
    }
  })
})

describe("dolphind migration requests fit the host's sealed inbound frame", () => {
  it('refuses, unsent, a manifest at the validation cap: sealed, it overflows the 1 MiB frame', async () => {
    await expect(
      stageRemoteDolphindMigrationCatalog(
        pairingCode,
        manifestOfBytes(MAX_DOLPHIND_MIGRATION_MANIFEST_BYTES)
      )
    ).rejects.toThrow(/\(dolphind_migration_manifest_too_large\)$/)
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('refuses, unsent, a commit whose blob list pushes a fitting manifest past the frame', async () => {
    const manifest = manifestOfBytes(760 * 1024)
    await expect(
      commitRemoteDolphindMigrationCatalog(pairingCode, manifest, { expectedBlobs: manyBlobs })
    ).rejects.toThrow(/too large to move to its Dolphin server/)
    expect(sendRequest).not.toHaveBeenCalled()
  })
})
