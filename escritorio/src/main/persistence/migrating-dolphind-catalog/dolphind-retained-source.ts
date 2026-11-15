import { createHash } from 'node:crypto'
import type { DolphindMigrationCatalogPayload } from '../../../shared/dolphind-migration/dolphind-migration-manifest'
import {
  MAX_DOLPHIND_MIGRATION_FOLDER_WORKSPACES,
  MAX_DOLPHIND_MIGRATION_REPOSITORIES
} from '../../../shared/dolphind-migration/dolphind-migration-manifest-fields'

import { isRetainedDolphindMigrationSourceCutover } from '../../../shared/dolphind-migration/dolphind-migration-source-cutover'
import type { DolphindMigrationSourceCutover } from '../../../shared/dolphind-migration/dolphind-migration-source-cutover'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { getDolphindSshDeployment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { SshTarget } from '../../../shared/ssh-types'
import type { Store } from '../loading-store/store'
import { collectDolphindMigrationSourceCatalog } from './dolphind-source-catalog'
import {
  listDolphindMigrationCutoverChainForTarget,
  writeDolphindMigrationSourceCutover
} from './dolphind-migration-cutover-journal'

import { dolphindMigrationCatalogIds } from './dolphind-migration-manifest-export'
import type { CatalogStore } from './dolphind-source-visibility'

type TargetStore = Pick<Store, 'getSshTargets' | 'updateSshTarget'>

/** Keep the identity-only fingerprint format stable for older builds; timestamps must not create source changes. */
export function dolphindCatalogFingerprint(catalog: DolphindMigrationCatalogPayload): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        catalog.repositories.map((repo) => `${repo.id}\0${repo.path}`).sort(),
        catalog.folderWorkspaces.map((folder) => `${folder.id}\0${folder.folderPath}`).sort(),
        catalog.projectGroups.map((group) => group.id).sort()
      ])
    )
    .digest('hex')
}

export function currentDolphindSourceFingerprint(
  store: CatalogStore,
  target: Pick<SshTarget, 'id'>
): string {
  return dolphindCatalogFingerprint(collectDolphindMigrationSourceCatalog(store, target))
}

type UnmovedDolphindSourceRows = { repositoryIds: string[]; folderWorkspaceIds: string[] }

/** Delta candidates exclude moved/linked/explicitly kept projects and folders. Group organization alone never represents new server work. */
export function unmovedDolphindSourceRows(
  current: DolphindMigrationCatalogPayload,
  chain: readonly DolphindMigrationSourceCutover[]
): UnmovedDolphindSourceRows {
  const moved = dolphindMigrationCatalogIds(chain.map((cutover) => cutover.manifest.payload))
  const repositories = new Set([
    ...moved.repositoryIds,
    ...chain.flatMap((cutover) => [
      ...(cutover.linkedRepositoryIds ?? []),
      ...(cutover.keptRepositoryIds ?? [])
    ])
  ])
  const folders = new Set([
    ...moved.folderWorkspaceIds,
    ...chain.flatMap((cutover) => [
      ...(cutover.linkedFolderWorkspaceIds ?? []),
      ...(cutover.keptFolderWorkspaceIds ?? [])
    ])
  ])
  return {
    repositoryIds: current.repositories.map((row) => row.id).filter((id) => !repositories.has(id)),
    folderWorkspaceIds: current.folderWorkspaces
      .map((row) => row.id)
      .filter((id) => !folders.has(id))
  }
}

function retainedDolphindSourceBaseline(head: DolphindMigrationSourceCutover): string {
  return head.sourceBaselineFingerprint ?? dolphindCatalogFingerprint(head.manifest.payload)
}

export function withKeptDolphindSourceRows(
  head: DolphindMigrationSourceCutover,
  unmoved: UnmovedDolphindSourceRows
): DolphindMigrationSourceCutover {
  const keptRepositoryIds = [...(head.keptRepositoryIds ?? []), ...unmoved.repositoryIds]
  const keptFolderWorkspaceIds = [
    ...(head.keptFolderWorkspaceIds ?? []),
    ...unmoved.folderWorkspaceIds
  ]
  // Beyond kept-row bounds, the baseline fingerprint still records explicit reconciliation.
  return keptRepositoryIds.length <= MAX_DOLPHIND_MIGRATION_REPOSITORIES &&
    keptFolderWorkspaceIds.length <= MAX_DOLPHIND_MIGRATION_FOLDER_WORKSPACES
    ? { ...head, keptRepositoryIds, keptFolderWorkspaceIds }
    : head
}

type RetainedSourceReview = {
  verdict: 'unchanged' | 'changed'
  unrecordedKeptRows: UnmovedDolphindSourceRows | null
}

/** New rows mark changed only when baseline differs; older explicit-keeps lack row lists and rely on that baseline. */
function reviewRetainedDolphindSource(
  store: CatalogStore,
  target: Pick<SshTarget, 'id'>,
  chain: readonly DolphindMigrationSourceCutover[],
  head: DolphindMigrationSourceCutover
): RetainedSourceReview {
  const current = collectDolphindMigrationSourceCatalog(store, target)
  const unmoved = unmovedDolphindSourceRows(current, chain)
  if (unmoved.repositoryIds.length === 0 && unmoved.folderWorkspaceIds.length === 0) {
    return { verdict: 'unchanged', unrecordedKeptRows: null }
  }
  if (dolphindCatalogFingerprint(current) !== retainedDolphindSourceBaseline(head)) {
    return { verdict: 'changed', unrecordedKeptRows: null }
  }
  return { verdict: 'unchanged', unrecordedKeptRows: unmoved }
}

/** At startup, restore generation-matched managed fences and detect retained-source additions. Failed reconciliation leaves state unchanged. */
export function reconcileManagedDolphindSshTargets(
  userDataPath: string,
  store: CatalogStore & TargetStore,
  now: () => Date = () => new Date()
): void {
  try {
    restoreFencesFromManagedServers(userDataPath, store)
    markChangedRetainedSources(userDataPath, store, now)
  } catch (error) {
    console.warn('[ssh] Could not reconcile managed Dolphin server hosts:', error)
  }
}

function restoreFencesFromManagedServers(userDataPath: string, store: TargetStore): void {
  const targets = new Map(store.getSshTargets().map((target) => [target.id, target]))
  for (const environment of listEnvironments(userDataPath)) {
    const deployment = getDolphindSshDeployment(environment)
    const target = deployment ? targets.get(deployment.sshTargetId) : undefined
    // Recreated ids identify new registrations; restore fences only for matching generation.
    if (target && !target.dolphindFence && target.generation === deployment?.sshTargetGeneration) {
      store.updateSshTarget(target.id, { dolphindFence: { environmentId: environment.id } })
    }
  }
}

function markChangedRetainedSources(
  userDataPath: string,
  store: CatalogStore & TargetStore,
  now: () => Date
): void {
  for (const target of store.getSshTargets()) {
    const fence = target.dolphindFence
    const chain = fence ? listDolphindMigrationCutoverChainForTarget(userDataPath, target.id) : []
    const head = chain.at(-1)
    if (!fence || !head || fence.environmentId !== head.destinationEnvironmentId) {
      continue
    }
    // Restore an interrupted delta's changed mark so reconnect resumes its journal.
    const interruptedDelta =
      head.supersedesMigrationId !== undefined &&
      (head.phase === 'source-fenced' || head.phase === 'destination-staged')
    const review =
      !interruptedDelta && isRetainedDolphindMigrationSourceCutover(head)
        ? reviewRetainedDolphindSource(store, target, chain, head)
        : null
    const kept = review?.unrecordedKeptRows
      ? withKeptDolphindSourceRows(head, review.unrecordedKeptRows)
      : head
    if (kept !== head) {
      // Record kept rows once so later group edits cannot turn them into new additions.
      writeDolphindMigrationSourceCutover(userDataPath, kept)
    }
    if (fence.sourceChangedAt) {
      // Clear older builds' marks for removals/group edits that delta migration cannot carry (#31523).
      if (review?.verdict === 'unchanged') {
        const { sourceChangedAt: _lifted, ...unmarked } = fence
        store.updateSshTarget(target.id, { dolphindFence: unmarked })
      }
      continue
    }
    if (interruptedDelta || review?.verdict === 'changed') {
      store.updateSshTarget(target.id, {
        dolphindFence: { ...fence, sourceChangedAt: now().toISOString() }
      })
    }
  }
}
