import type { GitCommitActionResult } from '../../../shared/git-commit-action'
import { callRuntimeRpc } from './rpc/calls/runtime-rpc-call'
import { toRuntimeWorktreeSelector } from './rpc/targets/runtime-worktree-selector'
import { resolveLocalWorktreePath, type RuntimeGitContext } from './source-control/git/runtime-git-client-context'

/**
 * Traer un commit de otra rama a esta.
 *
 * Why un timeout largo: un cherry-pick sobre un repo grande toca el árbol de trabajo entero, y
 * quedarse sin tiempo a la mitad dejaría el repo en un estado que esta función ya no controla.
 */
export async function cherryPickRuntimeGit(
  context: RuntimeGitContext,
  args: { commitId: string }
): Promise<GitCommitActionResult> {
  const target = context.target
  if (target.kind === 'local' || !context.worktreeId) {
    return window.api.git.cherryPick({
      worktreePath: resolveLocalWorktreePath(context),
      commitId: args.commitId,
      connectionId: context.connectionId
    })
  }
  return callRuntimeRpc<GitCommitActionResult>(
    target,
    'git.cherryPick',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), commitId: args.commitId },
    { timeoutMs: 120_000 }
  )
}

/** Empieza una rama en ese commit y se para ahí. Mismo camino y mismo plazo que el de arriba. */
export async function branchFromRuntimeGit(
  context: RuntimeGitContext,
  args: { commitId: string }
): Promise<GitCommitActionResult> {
  const target = context.target
  if (target.kind === 'local' || !context.worktreeId) {
    return window.api.git.branchFrom({
      worktreePath: resolveLocalWorktreePath(context),
      commitId: args.commitId,
      connectionId: context.connectionId
    })
  }
  return callRuntimeRpc<GitCommitActionResult>(
    target,
    'git.branchFrom',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), commitId: args.commitId },
    { timeoutMs: 120_000 }
  )
}

/** Deshace un commit con otro commit encima. Mismo camino y mismo plazo que el de arriba. */
export async function revertRuntimeGit(
  context: RuntimeGitContext,
  args: { commitId: string }
): Promise<GitCommitActionResult> {
  const target = context.target
  if (target.kind === 'local' || !context.worktreeId) {
    return window.api.git.revert({
      worktreePath: resolveLocalWorktreePath(context),
      commitId: args.commitId,
      connectionId: context.connectionId
    })
  }
  return callRuntimeRpc<GitCommitActionResult>(
    target,
    'git.revert',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), commitId: args.commitId },
    { timeoutMs: 120_000 }
  )
}
