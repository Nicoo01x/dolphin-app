import type { Worktree } from '../../../../../shared/worktree/types'
import { getIndexedWorktreeById } from '../../slices/worktrees/listing/worktree-catalog-index'
import type { AppState } from '../../types'

/** Git worktrees per repo id, in listing order. */
export function selectWorktreesByRepo<TState extends { worktreesByRepo?: unknown }>(
  state: TState
): TState['worktreesByRepo'] {
  return state.worktreesByRepo
}

export function selectFolderWorkspaces<TState extends { folderWorkspaces?: unknown }>(
  state: TState
): TState['folderWorkspaces'] {
  return state.folderWorkspaces
}

/**
 * Un worktree por su id.
 *
 * Why acá y no `getIndexedWorktreeById(state.worktreesByRepo, id)` en cada lugar: esa
 * forma lee el campo del store de primera mano, que es justo lo que este módulo existe
 * para concentrar. Buscar un worktree por id lo hacen cuatro pantallas y es la lectura
 * más común de todas.
 */
export function selectWorktreeById(
  state: Pick<AppState, 'worktreesByRepo'>,
  worktreeId: string
): Worktree | undefined {
  return getIndexedWorktreeById(state.worktreesByRepo, worktreeId)
}

/** Checkouts git reports that Dolphin does not track, per repo id. */
export function selectDetectedWorktreesByRepo<TState extends { detectedWorktreesByRepo?: unknown }>(
  state: TState
): TState['detectedWorktreesByRepo'] {
  return state.detectedWorktreesByRepo
}
