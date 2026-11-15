import { getAutomationRunRepoId } from '../../../../shared/automations/history/automation-run-identity'
import type { Automation } from '../../../../shared/automations/automation-definition'
import type { FolderWorkspace } from '../../../../shared/folder-workspaces/folder-workspace-types'
import { normalizeRuntimePathForComparison } from '../../../../shared/cross-platform-path'
import { isRepoOnCatalogHost } from '../../../../shared/execution-host'
import type { DolphindMigrationSourceCutover } from '../../../../shared/dolphind-migration/dolphind-migration-source-cutover'
import type { SshManagedServerLinkedProject } from '../../../../shared/ssh-types'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { splitWorktreeId } from '../../../../shared/worktree/id'
import type { Store } from '../../../persistence/loading-store/store'
import { abortDolphindMigrationCutover } from '../cutover/dolphind-migration-cutover-coordinator'
import type { DolphindMigrationDestinationCatalog } from '../cutover/dolphind-migration-cutover-coordinator'
import { writeDolphindMigrationSourceCutover } from '../../../persistence/migrating-dolphind-catalog/dolphind-migration-cutover-journal'
import { dolphindSourceStoreWithout } from '../cutover/dolphind-migration-delta-plan'
import type { DolphindDeltaSourceStore } from '../cutover/dolphind-migration-delta-plan'
import { createDolphindMigrationManifest } from '../../../persistence/migrating-dolphind-catalog/dolphind-migration-manifest-export'
import type { DolphindMigrationSourceCutoverPort } from '../cutover/dolphind-migration-source'
import { sshRelayMigrationCutoverPort } from '../../../ssh/migration-source/dolphind-migration-ssh-relay-source'
import { dolphindCatalogFingerprint } from '../../../persistence/migrating-dolphind-catalog/dolphind-retained-source'
import { folderWorkspacesHeldByServer } from './dolphind-server-folder-workspaces'
import type { DolphindServerFolderCatalog } from './dolphind-server-folder-workspaces'
import { projectGroupsHeldByServer, serverHeldProjectGroups } from './dolphind-server-project-groups'

import type { SshTargetDolphindClaims } from '../../../ssh/targets/ssh-target-dolphind-claims'
import type { DolphindServerRepository } from './dolphind-server-repositories'

/** Match only server-local checkouts. Same-id rows can survive earlier moves into stopped-server profiles (#29560); nested remote rows identify different hosts. */
export function repositoriesHeldByServer(
  incoming: readonly DolphindServerRepository[],
  server: readonly DolphindServerRepository[]
): { otherId: string[]; sameId: string[] } {
  const serverIdsByPath = new Map<string, Set<string>>()
  for (const repo of server.filter(isRepoOnCatalogHost)) {
    const key = normalizeRuntimePathForComparison(repo.path)
    serverIdsByPath.set(key, (serverIdsByPath.get(key) ?? new Set()).add(repo.id))
  }
  const otherId: string[] = []
  const sameId: string[] = []
  for (const repo of incoming) {
    const ids = serverIdsByPath.get(normalizeRuntimePathForComparison(repo.path))
    if (ids?.has(repo.id)) {
      sameId.push(repo.id)
    } else if (ids) {
      otherId.push(repo.id)
    }
  }
  return { otherId, sameId }
}

/** Link older same-id imports so retained desktop state cannot overwrite server edits. A commit awaiting journal update must resume instead. */
async function serverHeldRowsToLink(
  cutover: DolphindMigrationSourceCutover,
  destination: DolphindMigrationDestinationCatalog,
  server: readonly DolphindServerRepository[],
  serverFolders: DolphindServerFolderCatalog
): Promise<{ repositoryIds: string[]; folderWorkspaceIds: string[]; projectGroupIds: string[] }> {
  const { payload } = cutover.manifest
  const held = repositoriesHeldByServer(payload.repositories, server)
  const heldFolders = folderWorkspacesHeldByServer(payload.folderWorkspaces, serverFolders, server)
  const heldGroups = projectGroupsHeldByServer(payload.projectGroups, serverFolders)
  const otherIdOnly = { repositoryIds: held.otherId, folderWorkspaceIds: [], projectGroupIds: [] }
  if (held.sameId.length === 0 && heldFolders.length === 0 && heldGroups.length === 0) {
    return otherIdOnly
  }
  const state = await destination.readState(cutover.manifest)
  return state.state === 'committed'
    ? otherIdOnly
    : {
        repositoryIds: [...held.otherId, ...held.sameId],
        folderWorkspaceIds: heldFolders,
        projectGroupIds: heldGroups
      }
}

function linkedDolphindMigrationSource(
  store: Store,
  cutover: Pick<
    DolphindMigrationSourceCutover,
    | 'sshTargetId'
    | 'destinationEnvironmentId'
    | 'linkedRepositoryIds'
    | 'linkedProjectGroupIds'
    | 'linkedFolderWorkspaceIds'
  >
): (() => DolphindDeltaSourceStore) | undefined {
  const linked = cutover.linkedRepositoryIds ?? []
  const linkedGroups = cutover.linkedProjectGroupIds ?? []
  const linkedFolders = cutover.linkedFolderWorkspaceIds ?? []
  if (linked.length === 0 && linkedGroups.length === 0 && linkedFolders.length === 0) {
    return undefined
  }
  return () => {
    const target = store.getSshTarget(cutover.sshTargetId)
    if (!target) {
      throw new Error('dolphind_migration_source_fence_lost')
    }
    return dolphindSourceStoreWithout(
      store,
      target,
      {
        repositoryIds: new Set(linked),
        folderWorkspaceIds: new Set(linkedFolders),
        projectGroupIds: new Set()
      },
      cutover.destinationEnvironmentId,
      new Set(linkedGroups)
    )
  }
}

export function linkedDolphindMigrationCutoverPort(args: {
  userDataPath: string
  store: Store
  claims: SshTargetDolphindClaims
  cutover: DolphindMigrationSourceCutover
}): DolphindMigrationSourceCutoverPort {
  return sshRelayMigrationCutoverPort({
    userDataPath: args.userDataPath,
    store: args.store,
    claims: args.claims,
    freshSource: linkedDolphindMigrationSource(args.store, args.cutover)
  })
}

const NO_SERVER_FOLDERS: DolphindServerFolderCatalog = { folderWorkspaces: [], projectGroups: [] }

function leaseWorkspaceOwner(worktreeId: string): string | undefined {
  const scope = parseWorkspaceKey(worktreeId)
  return scope?.type === 'folder' ? scope.folderWorkspaceId : splitWorktreeId(worktreeId)?.repoId
}

/** Linking omits the original tab; refuse if the relay bridge still needs it or a live shell would be stranded. */
function assertNoRelayTerminalsIn(
  store: Pick<Store, 'getSshRemotePtyLeases'>,
  cutover: DolphindMigrationSourceCutover,
  linked: readonly string[],
  linkedFolders: readonly string[]
): void {
  const bridged = new Set(cutover.bridgedPtyIds ?? [])
  const owners = store
    .getSshRemotePtyLeases(cutover.sshTargetId)
    .filter((lease) => bridged.has(lease.ptyId) && lease.state !== 'terminated')
    .map((lease) => (lease.worktreeId ? leaseWorkspaceOwner(lease.worktreeId) : undefined))
  if (owners.length === 0) {
    return
  }
  const { repositories, folderWorkspaces } = cutover.manifest.payload
  const linkedRows = [
    ...repositories.filter((repo) => linked.includes(repo.id)),
    ...folderWorkspaces
      .filter((workspace) => linkedFolders.includes(workspace.id))
      .map((workspace) => ({ id: workspace.id, path: workspace.folderPath }))
  ]
  const blocked = linkedRows.find((row) => owners.includes(row.id))
  if (blocked) {
    throw new Error(`dolphind_migration_linked_project_terminals:${blocked.path}`)
  }
  const moving = new Set([...repositories, ...folderWorkspaces].map((row) => row.id))
  // A lease whose project can't be told, or isn't moving, may be one a link would strand.
  if (owners.some((owner) => owner === undefined || !moving.has(owner))) {
    throw new Error(
      `dolphind_migration_linked_project_unowned_terminals:${linkedRows.map((row) => row.path).join(', ')}`
    )
  }
}

export function linkedDolphindMigrationProjects(
  store: {
    getRepos(): DolphindServerRepository[]
    getFolderWorkspaces(): Pick<FolderWorkspace, 'id' | 'folderPath'>[]
    listAutomations(): Pick<Automation, 'projectId' | 'runContext'>[]
  },
  cutover: Pick<DolphindMigrationSourceCutover, 'linkedRepositoryIds' | 'linkedFolderWorkspaceIds'>
): SshManagedServerLinkedProject[] {
  const linked = new Set(cutover.linkedRepositoryIds ?? [])
  const linkedFolders = new Set(cutover.linkedFolderWorkspaceIds ?? [])
  if (linked.size === 0 && linkedFolders.size === 0) {
    return []
  }
  const automations = store.listAutomations()
  return [
    ...store
      .getRepos()
      .filter((repo) => linked.has(repo.id))
      .map((repo) => ({
        path: repo.path,
        automations: automations.filter((entry) => getAutomationRunRepoId(entry) === repo.id).length
      })),
    ...store
      .getFolderWorkspaces()
      .filter((workspace) => linkedFolders.has(workspace.id))
      .map((workspace) => ({ path: workspace.folderPath, automations: 0 }))
  ]
}

export async function linkServerHeldRepositories(args: {
  userDataPath: string
  store: Store
  claims: SshTargetDolphindClaims
  cutover: DolphindMigrationSourceCutover
  destination: DolphindMigrationDestinationCatalog
  serverRepositories: () => Promise<DolphindServerRepository[]>
  /** Absent: the server's folder workspaces aren't read, so none of them link. */
  serverFolderCatalog?: () => Promise<DolphindServerFolderCatalog>
  now?: () => Date
}): Promise<DolphindMigrationSourceCutover> {
  const { cutover, userDataPath } = args
  if (cutover.phase !== 'source-fenced' && cutover.phase !== 'destination-staged') {
    return cutover
  }
  const serverRepositories = await args.serverRepositories()
  const { folderWorkspaces, projectGroups } = cutover.manifest.payload
  const serverCatalog =
    folderWorkspaces.length > 0 || projectGroups.length > 0
      ? await args.serverFolderCatalog?.()
      : undefined
  const serverFolders = serverCatalog ?? NO_SERVER_FOLDERS
  const {
    repositoryIds: linked,
    folderWorkspaceIds: folders,
    projectGroupIds: heldGroups
  } = await serverHeldRowsToLink(cutover, args.destination, serverRepositories, serverFolders)
  if (linked.length === 0 && folders.length === 0 && heldGroups.length === 0) {
    return cutover
  }
  assertNoRelayTerminalsIn(args.store, cutover, linked, folders)
  const source = linkedDolphindMigrationCutoverPort(args)
  // Re-export only after verifying the original fenced source still matches.
  source.verifyFence(cutover)
  const linkedRepositoryIds = [...new Set([...(cutover.linkedRepositoryIds ?? []), ...linked])]
  const linkedFolderWorkspaceIds = [
    ...new Set([...(cutover.linkedFolderWorkspaceIds ?? []), ...folders])
  ]
  const linkedProjectGroupIds = [
    ...new Set([
      ...(cutover.linkedProjectGroupIds ?? []),
      ...serverHeldProjectGroups(
        cutover.manifest.payload,
        {
          repositoryIds: new Set(linkedRepositoryIds),
          folderWorkspaceIds: new Set(linkedFolderWorkspaceIds)
        },
        [...serverRepositories, ...serverFolders.folderWorkspaces],
        serverCatalog
      )
    ])
  ]
  const linkedIds = {
    ...(linkedRepositoryIds.length > 0 ? { linkedRepositoryIds } : {}),
    ...(linkedProjectGroupIds.length > 0 ? { linkedProjectGroupIds } : {}),
    ...(linkedFolderWorkspaceIds.length > 0 ? { linkedFolderWorkspaceIds } : {})
  }
  const view = linkedDolphindMigrationSource(args.store, { ...cutover, ...linkedIds })?.()
  const target = args.store.getSshTarget(cutover.sshTargetId)
  if (!view || !target) {
    throw new Error('dolphind_migration_source_fence_lost')
  }
  const manifest = createDolphindMigrationManifest(view, target, {
    migrationId: cutover.migrationId,
    destinationEnvironmentId: cutover.destinationEnvironmentId,
    now: () => new Date(cutover.manifest.createdAt)
  })
  const relinked: DolphindMigrationSourceCutover = {
    ...cutover,
    phase: 'source-fenced',
    updatedAt: (args.now ?? (() => new Date()))().toISOString(),
    manifestSha256: manifest.manifestSha256,
    manifest,
    ...linkedIds,
    // Retained rows include linked projects, so baseline the entire fenced source.
    sourceBaselineFingerprint:
      cutover.sourceBaselineFingerprint ?? dolphindCatalogFingerprint(cutover.manifest.payload)
  }
  const aborted = await abortDolphindMigrationCutover(
    { userDataPath, store: args.store, claims: args.claims, destination: args.destination, source },
    cutover.migrationId,
    // Relinking continues the same move/server, so retain its fence.
    async () => writeDolphindMigrationSourceCutover(userDataPath, relinked)
  )
  if (aborted.outcome !== 'released') {
    throw new Error(aborted.code)
  }
  return relinked
}
