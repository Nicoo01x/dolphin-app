import { ipcMain } from 'electron'
import { branchFromCommit } from '../../git/acciones-de-commit'
import type { GitRuntimeOptions } from '../../git/git-runtime-options'
import type { GitCommitActionResult } from '../../../shared/git-commit-action'
import { resolveRegisteredWorktreePath } from '../worktrees/removal/registered-worktree-roots-cache'
import { getLocalGitOptionsForRegisteredWorktree } from '../local-worktree-runtime-options'
import type { FilesystemHandlerContext } from './filesystem-handler-context'
import { requireReachableGitRoute } from '../../providers/execution-host-provider-dispatch'
import { getConnectionExecutionHostId } from '../../../shared/execution-host'

type Args = { worktreePath: string; commitId: string; connectionId?: string }

/**
 * Empezar una rama en un commit de un worktree de esta máquina.
 *
 * El camino remoto va por el RPC `git.branchFrom`; este es el local, que es el que usa la app
 * cuando el repo está acá. Traer y deshacer un commit (`git:cherryPick` / `git:revert`) ya los
 * registra la base en `filesystem-git-commit-handlers.ts`: registrarlos dos veces hace tirar a Electron.
 */
export function registerFilesystemGitCommitActionHandlers(context: FilesystemHandlerContext): void {
  const { store } = context

  const correr = async (
    args: Args,
    accion: (
      worktreePath: string,
      commitId: string,
      options: GitRuntimeOptions
    ) => Promise<GitCommitActionResult>
  ): Promise<GitCommitActionResult> => {
    // Why validar acá además del esquema del RPC: este canal se alcanza por su cuenta, y lo que
    // sigue le pasa el id a git como argumento.
    if (typeof args.commitId !== 'string' || !/^[0-9a-fA-F]{4,40}$/.test(args.commitId)) {
      throw new Error('invalid_commit_id')
    }
    requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
    const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
    const gitOptions = getLocalGitOptionsForRegisteredWorktree(
      store,
      args.worktreePath,
      worktreePath
    )
    return accion(worktreePath, args.commitId, { ...gitOptions, admissionTier: 'interactive' })
  }

  ipcMain.handle('git:branchFrom', async (_event, args: Args) => correr(args, branchFromCommit))
}
