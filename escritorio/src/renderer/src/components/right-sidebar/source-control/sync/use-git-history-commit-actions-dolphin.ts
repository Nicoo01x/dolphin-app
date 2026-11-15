import { useCallback } from 'react'
import type { GitHistoryItem } from '../../../../../../shared/git/history/git-history-types'
import { sourceControlConnectionId, useSourceControlScope } from '../panel/worktree-scope'
import { correrAccionDeCommit } from './git-history-commit-action-run'
import type { GitHistoryCommitAction } from './git-history-commit-context-menu'
import { useGitHistoryCommitActions } from './use-git-history-commit-actions'
import { requireGitOwnerTarget } from './worktree-git-owner-target'

type AccionDeCommitDolphin = Extract<
  GitHistoryCommitAction,
  'cherry-pick' | 'revert' | 'branch-from'
>

function esAccionDeCommitDolphin(action: GitHistoryCommitAction): action is AccionDeCommitDolphin {
  return action === 'cherry-pick' || action === 'revert' || action === 'branch-from'
}

/**
 * Las acciones de commit de la base más las tres que suma Dolphin: traer un commit, deshacerlo y
 * empezar una rama en él.
 *
 * Why envolviendo el hook y no adentro: el de la base está en su tope de líneas, y así queda igual al
 * de la base; las acciones de Dolphin se atienden antes y el resto sigue su camino de siempre.
 */
export function useGitHistoryCommitActionsDolphin(
  args: Parameters<typeof useGitHistoryCommitActions>[0]
): ReturnType<typeof useGitHistoryCommitActions> {
  const acciones = useGitHistoryCommitActions(args)
  const scope = useSourceControlScope()
  const { activeWorktreeId, worktreePath, activeRepoTarget, ownerConnectionId } = args
  const handleCommitActionDeLaBase = acciones.handleCommitAction
  const handleCommitAction = useCallback(
    (action: GitHistoryCommitAction, item: GitHistoryItem): void => {
      if (!esAccionDeCommitDolphin(action)) {
        handleCommitActionDeLaBase(action, item)
        return
      }
      if (!activeWorktreeId || !worktreePath) {
        return
      }
      void correrAccionDeCommit(
        {
          target: requireGitOwnerTarget(activeRepoTarget),
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId: sourceControlConnectionId(scope, activeWorktreeId, ownerConnectionId)
        },
        action,
        item.id
      )
    },
    [
      handleCommitActionDeLaBase,
      activeRepoTarget,
      activeWorktreeId,
      scope,
      worktreePath,
      ownerConnectionId
    ]
  )
  return { ...acciones, handleCommitAction }
}
