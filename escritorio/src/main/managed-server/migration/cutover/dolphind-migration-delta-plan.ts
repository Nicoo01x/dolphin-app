/** Subtract earlier migrations' currently retained rows/state; export only additions. Never merge overlapping old source copies over server-owned state. */
import type {
  DolphindDeltaMovePreview,
  DolphindDeltaMoveRow
} from '../../../../shared/dolphind-managed-runtime'
import type {
  DolphindMigrationCatalogPayload,
  DolphindMigrationManifest
} from '../../../../shared/dolphind-migration/dolphind-migration-manifest'
import { isRetainedDolphindMigrationSourceCutover } from '../../../../shared/dolphind-migration/dolphind-migration-source-cutover'
import type { DolphindMigrationSourceCutover } from '../../../../shared/dolphind-migration/dolphind-migration-source-cutover'
import type { SshTarget } from '../../../../shared/ssh-types'
import type { Store } from '../../../persistence/loading-store/store'
import { collectDolphindMigrationSourceCatalog } from '../../../persistence/migrating-dolphind-catalog/dolphind-source-catalog'
import { listDolphindMigrationCutoverChainForTarget } from '../../../persistence/migrating-dolphind-catalog/dolphind-migration-cutover-journal'
import {
  createDolphindMigrationManifest,
  dolphindMigrationCatalogIds,
  type DolphindMigrationCatalogIds
} from '../../../persistence/migrating-dolphind-catalog/dolphind-migration-manifest-export'
import type { DolphindMigrationSnapshotSource } from '../transfers/dolphind-migration-snapshot-coordinator'
import { collectUntransferredDependentBlockers } from '../../../ssh/targets/ssh-target-dolphind-dependents'
import type { DolphindMigrationPreflightStore } from '../../../ssh/targets/ssh-target-dolphind-preflight'

export type DolphindDeltaSourceStore = DolphindMigrationPreflightStore &
  DolphindMigrationSnapshotSource

export function unfinishedDolphindDelta(
  chain: readonly DolphindMigrationSourceCutover[]
): DolphindMigrationSourceCutover | null {
  const head = chain.at(-1)
  return head?.supersedesMigrationId &&
    head.phase !== 'source-retired' &&
    !isRetainedDolphindMigrationSourceCutover(head)
    ? head
    : null
}

export function committedDolphindMigrationChain(
  chain: readonly DolphindMigrationSourceCutover[]
): DolphindMigrationSourceCutover[] {
  return (unfinishedDolphindDelta(chain) ? chain.slice(0, -1) : chain).filter(
    (cutover) => cutover.phase === 'destination-committed' || cutover.phase === 'source-retired'
  )
}

export function dolphindDeltaSourceStore(
  store: Store,
  target: SshTarget,
  moved: readonly DolphindMigrationSourceCutover[],
  /** Older interrupted deltas may still include server-owned groups. */
  journaled?: DolphindMigrationManifest
): DolphindDeltaSourceStore {
  const ids = dolphindMigrationCatalogIds(moved.map((cutover) => cutover.manifest.payload))
  // Never move projects/groups already owned through earlier links.
  const linked = moved.flatMap((cutover) => cutover.linkedRepositoryIds ?? [])
  const linkedGroups = moved.flatMap((cutover) => cutover.linkedProjectGroupIds ?? [])
  const linkedFolders = moved.flatMap((cutover) => cutover.linkedFolderWorkspaceIds ?? [])
  // New rows reference server-owned groups; exporting retained copies could overwrite newer server edits.
  const serverGroups = new Set([...ids.projectGroupIds, ...linkedGroups])
  const exported = new Set(journaled?.payload.projectGroups.map((group) => group.id))
  return dolphindSourceStoreWithout(
    store,
    target,
    {
      ...ids,
      repositoryIds: new Set([...ids.repositoryIds, ...linked]),
      folderWorkspaceIds: new Set([...ids.folderWorkspaceIds, ...linkedFolders]),
      projectGroupIds: serverGroups
    },
    moved.at(-1)?.destinationEnvironmentId,
    new Set([...serverGroups].filter((id) => !exported.has(id)))
  )
}

export function dolphindSourceStoreWithout(
  store: Store,
  target: SshTarget,
  owned: DolphindMigrationCatalogIds,
  destinationEnvironmentId: string | undefined,
  /** Groups the server's record wins for: never exported, even while a moving row sits in one. */
  serverGroupIds: ReadonlySet<string> = new Set()
): DolphindDeltaSourceStore {
  const ownedNow = createDolphindMigrationManifest(store, target, {
    destinationEnvironmentId,
    onlyCatalog: owned
  })
  const view = store.createDolphindMigrationDeltaView(ownedNow)
  return {
    ...view,
    serverOwnedProjectGroupIds: serverGroupIds,
    getSshTarget: (id) => store.getSshTarget(id),
    getSshRemotePtyLeases: (id) => store.getSshRemotePtyLeases(id),
    readDolphindMigrationSourceSnapshotChunk: (...args) =>
      store.readDolphindMigrationSourceSnapshotChunk(...args)
  }
}

export type DolphindDeltaMovePlan = DolphindDeltaMovePreview & {
  manifest: DolphindMigrationManifest
  moved: DolphindMigrationSourceCutover[]
  head: DolphindMigrationSourceCutover
  resumes: DolphindMigrationSourceCutover | null
  source: DolphindDeltaSourceStore
}

export function planDolphindDeltaMove(
  userDataPath: string,
  store: Store,
  target: SshTarget,
  options: { migrationId?: string; now?: () => Date } = {}
): DolphindDeltaMovePlan {
  const environmentId = target.dolphindFence?.environmentId
  if (!environmentId || !target.dolphindFence?.sourceChangedAt) {
    throw new Error('dolphind_delta_not_changed')
  }
  const chain = listDolphindMigrationCutoverChainForTarget(userDataPath, target.id)
  const resumes = unfinishedDolphindDelta(chain)
  const moved = committedDolphindMigrationChain(chain)
  const head = chain.at(resumes ? -2 : -1)
  if (
    !head ||
    !isRetainedDolphindMigrationSourceCutover(head) ||
    moved.at(-1)?.migrationId !== head.migrationId
  ) {
    throw new Error('dolphind_delta_no_retained_migration')
  }
  const source = dolphindDeltaSourceStore(store, target, moved, resumes?.manifest)
  const manifest =
    resumes?.manifest ??
    createDolphindMigrationManifest(source, target, {
      migrationId: options.migrationId,
      now: options.now,
      destinationEnvironmentId: environmentId
    })
  const current = collectDolphindMigrationSourceCatalog(store, target)
  return {
    sshTargetId: target.id,
    environmentId,
    added: catalogRows(manifest.payload),
    notReflected: notReflected(
      current,
      moved.map((cutover) => cutover.manifest.payload)
    ),
    blockers: collectUntransferredDependentBlockers(source, manifest),
    manifest,
    moved,
    head,
    resumes,
    source
  }
}

function catalogRows(catalog: DolphindMigrationCatalogPayload): DolphindDeltaMoveRow[] {
  return [
    ...catalog.repositories.map((row) => ({
      kind: 'repository' as const,
      id: row.id,
      label: row.displayName
    })),
    ...catalog.folderWorkspaces.map((row) => ({
      kind: 'folder-workspace' as const,
      id: row.id,
      label: row.name
    })),
    ...catalog.projectGroups.map((row) => ({
      kind: 'project-group' as const,
      id: row.id,
      label: row.name
    }))
  ]
}

/** Rows earlier migrations moved that an older build has since changed or removed. */
function notReflected(
  current: DolphindMigrationCatalogPayload,
  movedPayloads: readonly DolphindMigrationCatalogPayload[]
): DolphindDeltaMovePreview['notReflected'] {
  const latestMoved = new Map<string, { row: DolphindDeltaMoveRow; identity: string }>()
  for (const payload of movedPayloads) {
    for (const row of catalogRows(payload)) {
      latestMoved.set(`${row.kind}:${row.id}`, { row, identity: identityOf(payload, row) })
    }
  }
  const currentByKey = new Map(
    catalogRows(current).map((row) => [`${row.kind}:${row.id}`, identityOf(current, row)])
  )
  const edited: DolphindDeltaMoveRow[] = []
  const removed: DolphindDeltaMoveRow[] = []
  for (const [key, moved] of latestMoved) {
    const identity = currentByKey.get(key)
    if (identity === undefined) {
      removed.push(moved.row)
    } else if (identity !== moved.identity) {
      edited.push(moved.row)
    }
  }
  return { edited, removed }
}

function identityOf(catalog: DolphindMigrationCatalogPayload, row: DolphindDeltaMoveRow): string {
  switch (row.kind) {
    case 'repository': {
      const repo = catalog.repositories.find((entry) => entry.id === row.id)
      return `${repo?.path}\0${repo?.displayName}`
    }
    case 'folder-workspace': {
      const folder = catalog.folderWorkspaces.find((entry) => entry.id === row.id)
      return `${folder?.folderPath}\0${folder?.name}`
    }
    case 'project-group':
      return catalog.projectGroups.find((entry) => entry.id === row.id)?.name ?? ''
  }
}
