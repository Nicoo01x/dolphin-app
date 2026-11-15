import { vi, type Mock } from 'vitest'
import type {
  DolphindMigrationCatalogState,
  DolphindMigrationManifest
} from '../../../../../shared/dolphind-migration/dolphind-migration-manifest'
import { parseDolphindMigrationManifest } from '../../../../../shared/dolphind-migration/dolphind-migration-manifest-validation'
import { advertisedDolphindMigrationDestinationCapabilities } from '../../../../dolphind/dolphind-migration-destination-capabilities'
import { assertDolphindMigrationManifestDigest } from '../../../../dolphind/dolphind-migration-manifest-digest'
import type { Store } from '../../../../persistence/loading-store/store'
import type { DolphindMigrationDestinationCatalog } from '../dolphind-migration-cutover-coordinator'

type Catalog = DolphindMigrationDestinationCatalog

export type FakeDolphindMigrationDestination = { commits: number } & {
  [Method in keyof Catalog]: Mock<Catalog[Method]>
}

/** Model idempotent stage and receipt-keyed commit with separate catalog state for each migration, including later deltas. */
export function fakeDolphindMigrationDestination(): FakeDolphindMigrationDestination {
  const states = new Map<string, 'absent' | 'staged' | 'committed'>()
  const stateOf = (manifest: Pick<DolphindMigrationManifest, 'migrationId'>) =>
    states.get(manifest.migrationId) ?? 'absent'
  const view = (manifest: DolphindMigrationManifest): DolphindMigrationCatalogState => {
    const state = stateOf(manifest)
    const base = { migrationId: manifest.migrationId, manifestSha256: manifest.manifestSha256 }
    if (state === 'committed') {
      return {
        ...base,
        state,
        receipt: {
          version: 1,
          migrationId: manifest.migrationId,
          manifestSha256: manifest.manifestSha256,
          source: manifest.source,
          importedAt: '2026-10-01T00:00:00.000Z',
          repositoryIds: [],
          projectGroupIds: [],
          folderWorkspaceIds: []
        }
      }
    }
    return state === 'staged'
      ? { ...base, state, stagedAt: '2026-10-01T00:00:00.000Z', snapshotUploads: [] }
      : { ...base, state }
  }
  const destination: FakeDolphindMigrationDestination = {
    commits: 0,
    readState: vi.fn<Catalog['readState']>(async (manifest: DolphindMigrationManifest) =>
      view(manifest)
    ),
    stage: vi.fn<Catalog['stage']>(async (manifest: DolphindMigrationManifest) => {
      if (stateOf(manifest) === 'absent') {
        states.set(manifest.migrationId, 'staged')
      }
      return view(manifest)
    }),
    commit: vi.fn<Catalog['commit']>(async (manifest: DolphindMigrationManifest) => {
      if (stateOf(manifest) === 'staged') {
        states.set(manifest.migrationId, 'committed')
        destination.commits += 1
      }
      return view(manifest)
    }),
    abort: vi.fn<Catalog['abort']>(async (manifest: DolphindMigrationManifest) => {
      const aborted = stateOf(manifest) === 'staged'
      if (aborted) {
        states.set(manifest.migrationId, 'absent')
      }
      return { ...view(manifest), aborted, ...(aborted ? {} : { durableAbsent: true as const }) }
    }),
    abortByReference: vi.fn<Catalog['abortByReference']>(async (manifest) => {
      const identity = {
        migrationId: manifest.migrationId,
        manifestSha256: manifest.manifestSha256
      }
      if (stateOf(manifest) === 'committed') {
        return { ...identity, state: 'committed', aborted: false }
      }
      const aborted = stateOf(manifest) === 'staged'
      states.delete(manifest.migrationId)
      return { ...identity, state: 'absent', aborted, durableAbsent: true }
    }),
    stageChunk: vi.fn<Catalog['stageChunk']>(),
    readCapabilities: vi.fn<Catalog['readCapabilities']>(async () => []),
    stageBlobChunk: vi.fn<Catalog['stageBlobChunk']>()
  }
  return destination
}

/** A host server's real import, behind manifests sent as the RPC handler receives them. */
export function storeBackedDolphindMigrationDestination(server: Store): Catalog {
  const sent = (manifest: DolphindMigrationManifest): DolphindMigrationManifest => {
    const raw = JSON.parse(JSON.stringify(manifest))
    assertDolphindMigrationManifestDigest(raw)
    return parseDolphindMigrationManifest(raw)
  }
  return {
    readState: async (manifest) => server.getDolphindMigrationCatalogState(sent(manifest)),
    stage: async (manifest) => server.stageDolphindMigrationCatalog(sent(manifest)),
    commit: async (manifest) => server.commitStagedDolphindMigrationCatalog(sent(manifest)),
    abort: async (manifest) => {
      const result = server.abortStagedDolphindMigrationCatalog(sent(manifest))
      return result.aborted ? result : { ...result, durableAbsent: true as const }
    },
    abortByReference: async (reference) =>
      server.abortStagedDolphindMigrationCatalogByReference(reference),
    stageChunk: async (request) => server.stageDolphindMigrationSnapshotChunk(request),
    readCapabilities: async () => advertisedDolphindMigrationDestinationCapabilities(),
    stageBlobChunk: async (request) => server.stageDolphindMigrationBlobChunk(request)
  }
}
