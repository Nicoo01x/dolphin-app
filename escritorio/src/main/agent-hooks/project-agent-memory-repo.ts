import type { Store } from '../persistence/loading-store/store'
import { getRepoExecutionHostId, isLocalExecutionHost } from '../../shared/execution-host'
import { getRepoIdFromWorktreeId } from '../../shared/worktree/id'

/**
 * Dónde vive la memoria de una sesión: en el repo del worktree (no en el worktree), así todas las
 * ramas leen y aprenden lo mismo. Solo repos locales: la memoria es un archivo en este disco.
 */
export function projectMemoryRepoPath(
  store: Pick<Store, 'getRepo'> | null | undefined,
  worktreeId: string | undefined
): string | null {
  if (!worktreeId || !store) {
    return null
  }
  const repo = store.getRepo(getRepoIdFromWorktreeId(worktreeId))
  if (!repo || repo.kind === 'folder' || !isLocalExecutionHost(getRepoExecutionHostId(repo))) {
    return null
  }
  return repo.path
}
