import { describe, expect, it, vi } from 'vitest'
import { DOLPHIND_MIGRATION_MANIFEST_VERSION } from '../../../../../shared/dolphind-migration/dolphind-migration-manifest-validation'
import type { DolphindMigrationManifest } from '../../../../../shared/dolphind-migration/dolphind-migration-manifest'
import { computeDolphindMigrationManifestSha256 } from '../../../../dolphind/dolphind-migration-manifest-digest'
import type { DolphinRuntimeService } from '../../../dolphin-runtime'
import { eraseRpcMethods, isStreamingMethod, type RpcContext } from '../../core'
import '../rpc-method-registry'
import { DOLPHIND_MIGRATION_METHODS } from './dolphind-migration'

function manifest(): DolphindMigrationManifest {
  const unsigned = {
    version: DOLPHIND_MIGRATION_MANIFEST_VERSION,
    migrationId: 'migration-1',
    createdAt: '2026-08-30T12:00:00.000Z',
    source: {
      sshTargetId: 'ssh-prod',
      sshTargetGeneration: 7,
      targetLabel: 'Production'
    },
    payload: { repositories: [], projectGroups: [], folderWorkspaces: [] }
  }
  return {
    ...unsigned,
    manifestSha256: computeDolphindMigrationManifestSha256(unsigned)
  }
}

const MIGRATION_METHOD_NAMES = [
  'dolphind.migration.stageCatalog',
  'dolphind.migration.commitCatalog',
  'dolphind.migration.stageSnapshotChunk',
  'dolphind.migration.stageBlobChunk',
  'dolphind.migration.abortCatalog',
  'dolphind.migration.abortCatalogByReference',
  'dolphind.migration.catalogState'
] as const

function migrationMethod(
  name: (typeof MIGRATION_METHOD_NAMES)[number] = MIGRATION_METHOD_NAMES[0]
) {
  const method = eraseRpcMethods(DOLPHIND_MIGRATION_METHODS).find(
    (candidate) => candidate.name === name
  )
  if (!method || isStreamingMethod(method)) {
    throw new Error(`Missing or invalid ${name} method`)
  }
  return method
}

function context(
  stageDolphindMigrationCatalog: ReturnType<typeof vi.fn>,
  overrides: Partial<RpcContext> = {},
  runtimeOverrides: Record<string, unknown> = {}
): RpcContext {
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the migration methods call only the runtime members stubbed here.
    runtime: {
      stageDolphindMigrationCatalog,
      ...runtimeOverrides
    } as unknown as DolphinRuntimeService,
    clientKind: 'runtime',
    pairedDeviceId: 'paired-desktop',
    ...overrides
  }
}

describe('dolphind migration RPC', () => {
  it.each([
    ['mobile client', { clientKind: 'mobile', pairedDeviceId: 'paired-phone' }],
    ['unpaired runtime client', { clientKind: 'runtime', pairedDeviceId: undefined }],
    ['local caller', { clientKind: undefined, pairedDeviceId: undefined }]
  ] as const)('rejects a %s before any migration mutation', async (_label, caller) => {
    for (const name of MIGRATION_METHOD_NAMES) {
      const invoke = vi.fn()
      const method = migrationMethod(name)
      const runtimeMethod =
        name === 'dolphind.migration.stageCatalog'
          ? 'stageDolphindMigrationCatalog'
          : name === 'dolphind.migration.commitCatalog'
            ? 'commitStagedDolphindMigrationCatalog'
            : name === 'dolphind.migration.stageSnapshotChunk'
              ? 'stageDolphindMigrationSnapshotChunk'
              : name === 'dolphind.migration.stageBlobChunk'
                ? 'stageDolphindMigrationBlobChunk'
                : name === 'dolphind.migration.abortCatalog'
                  ? 'abortStagedDolphindMigrationCatalog'
                  : name === 'dolphind.migration.abortCatalogByReference'
                    ? 'abortStagedDolphindMigrationCatalogByReference'
                    : 'getDolphindMigrationCatalogState'

      await expect(
        method.handler(
          method.params?.parse(migrationMethodInput(name)),
          context(invoke, caller, { [runtimeMethod]: invoke })
        )
      ).rejects.toThrow('dolphind_migration_runtime_client_required')
      expect(invoke).not.toHaveBeenCalled()
    }
  })

  it('rejects malformed and tampered manifests before staging', async () => {
    const stageCatalog = vi.fn()
    const method = migrationMethod()
    const input = manifest()

    await expect(
      method.handler(
        method.params?.parse({ manifest: { ...input, manifestSha256: 'invalid' } }),
        context(stageCatalog)
      )
    ).rejects.toThrow('dolphind_migration_manifest_digest_invalid')
    await expect(
      method.handler(
        method.params?.parse({
          manifest: { ...input, source: { ...input.source, targetLabel: 'Tampered' } }
        }),
        context(stageCatalog)
      )
    ).rejects.toThrow('dolphind_migration_manifest_digest_mismatch')
    expect(stageCatalog).not.toHaveBeenCalled()
  })

  it('verifies a newer client signature over fields this host does not know', async () => {
    const stageCatalog = vi.fn()
    const method = migrationMethod()
    const { manifestSha256: _, ...known } = manifest()
    const unsigned = {
      ...known,
      futureField: { enabled: true },
      source: { ...known.source, futureSourceField: 'x' }
    }
    const signed = {
      ...unsigned,
      manifestSha256: computeDolphindMigrationManifestSha256(unsigned)
    }

    await method.handler(method.params?.parse({ manifest: signed }), context(stageCatalog))
    expect(stageCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ manifestSha256: signed.manifestSha256, source: known.source }),
      expect.anything()
    )
    await expect(
      method.handler(
        method.params?.parse({ manifest: { ...signed, futureField: { enabled: false } } }),
        context(stageCatalog)
      )
    ).rejects.toThrow('dolphind_migration_manifest_digest_mismatch')
    const { futureField: __, ...stripped } = signed
    await expect(
      method.handler(method.params?.parse({ manifest: stripped }), context(stageCatalog)),
      'a peer that drops a signed field'
    ).rejects.toThrow('dolphind_migration_manifest_digest_mismatch')
    expect(stageCatalog).toHaveBeenCalledTimes(1)
  })
})

function migrationSnapshotRequest(input: DolphindMigrationManifest) {
  return {
    migrationId: input.migrationId,
    manifestSha256: input.manifestSha256,
    ref: `v1-${'1'.repeat(32)}`,
    offset: 0,
    bytesBase64: 'YQ=='
  }
}

function migrationMethodInput(name: (typeof MIGRATION_METHOD_NAMES)[number]) {
  const input = manifest()
  if (name === 'dolphind.migration.stageBlobChunk') {
    return migrationBlobRequest(input)
  }
  if (name === 'dolphind.migration.abortCatalogByReference') {
    return { migrationId: input.migrationId, manifestSha256: input.manifestSha256 }
  }
  return name === 'dolphind.migration.stageSnapshotChunk'
    ? migrationSnapshotRequest(input)
    : { manifest: input }
}

function migrationBlobRequest(input: DolphindMigrationManifest, key = `${'a'.repeat(16)}-zsh`) {
  return {
    migrationId: input.migrationId,
    manifestSha256: input.manifestSha256,
    blob: { blobKind: 'shell-history', key, sha256: 'b'.repeat(64), byteLength: 1 },
    offset: 0,
    bytesBase64: 'YQ=='
  }
}
