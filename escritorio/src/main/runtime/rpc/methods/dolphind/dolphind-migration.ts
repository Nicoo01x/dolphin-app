import type { z } from 'zod'
import {
  DolphindMigrationCatalogParams,
  DolphindMigrationCatalogReferenceParams,
  DolphindMigrationCommitCatalogParams
} from '../../../../../shared/rpc-contract/dolphind-migration-params'
import { parseDolphindMigrationManifest } from '../../../../../shared/dolphind-migration/dolphind-migration-manifest-validation'
import { DolphindMigrationSnapshotChunkRequestSchema } from '../../../../../shared/dolphind-migration/dolphind-migration-scrollback'
import { DolphindMigrationBlobChunkRequestSchema } from '../../../../../shared/dolphind-migration/dolphind-migration-blob-transfer'
import { assertDolphindMigrationManifestDigest } from '../../../../dolphind/dolphind-migration-manifest-digest'
import { assertDolphindMigrationSourceServedHere } from '../../../../dolphind/dolphind-migration-wsl-destination'
import { defineMethod, type RpcContext } from '../../core'

export const DOLPHIND_MIGRATION_METHODS = [
  defineMethod({
    name: 'dolphind.migration.stageCatalog',
    permission: 'host-admin',
    params: DolphindMigrationCatalogParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.stageDolphindMigrationCatalog(migrationManifest(params), {
        signal: context.signal
      })
    }
  }),
  defineMethod({
    name: 'dolphind.migration.commitCatalog',
    permission: 'host-admin',
    params: DolphindMigrationCommitCatalogParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.commitStagedDolphindMigrationCatalog(migrationManifest(params), {
        signal: context.signal,
        ...(params.expectedBlobs ? { expectedBlobs: params.expectedBlobs } : {})
      })
    }
  }),
  defineMethod({
    name: 'dolphind.migration.stageSnapshotChunk',
    permission: 'host-admin',
    params: DolphindMigrationSnapshotChunkRequestSchema,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.stageDolphindMigrationSnapshotChunk(params)
    }
  }),
  // A separate method, not a field on stageSnapshotChunk: an older host would strip the field and
  // stage the bytes as a snapshot.
  defineMethod({
    name: 'dolphind.migration.stageBlobChunk',
    permission: 'host-admin',
    params: DolphindMigrationBlobChunkRequestSchema,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.stageDolphindMigrationBlobChunk(params)
    }
  }),
  defineMethod({
    name: 'dolphind.migration.abortCatalog',
    permission: 'host-admin',
    params: DolphindMigrationCatalogParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.abortStagedDolphindMigrationCatalog(migrationManifest(params), {
        signal: context.signal
      })
    }
  }),
  // Why a reference: a source fenced on a manifest no request can carry must still be releasable.
  defineMethod({
    name: 'dolphind.migration.abortCatalogByReference',
    permission: 'host-admin',
    params: DolphindMigrationCatalogReferenceParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.abortStagedDolphindMigrationCatalogByReference(params, {
        signal: context.signal
      })
    }
  }),
  defineMethod({
    name: 'dolphind.migration.catalogState',
    permission: 'host-admin',
    params: DolphindMigrationCatalogParams,
    handler: async (params, context) => {
      requireMigrationRuntimeClient(context)
      return context.runtime.getDolphindMigrationCatalogState(migrationManifest(params))
    }
  })
]

function migrationManifest(params: z.infer<typeof DolphindMigrationCatalogParams>) {
  const manifest = parseDolphindMigrationManifest(params.manifest)
  // Raw, not parsed: parsing drops fields this host predates, which a newer client signed.
  assertDolphindMigrationManifestDigest(params.manifest)
  assertDolphindMigrationSourceServedHere(manifest.source)
  return manifest
}

function requireMigrationRuntimeClient(context: RpcContext): void {
  if (context.clientKind !== 'runtime' || !context.pairedDeviceId) {
    throw new Error('dolphind_migration_runtime_client_required')
  }
}
