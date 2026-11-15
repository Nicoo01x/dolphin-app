import { ipcMain } from 'electron'
import type { GitDiffResult } from '../../../shared/git/diff/git-diff-compare-types'
import { getBranchDiff } from '../../git/source-control/branch-diff'
import { getCommitDiff } from '../../git/source-control/commit-diff'
import { readUnstagedLeftBlob } from '../../git/source-control/git-blob-read'
import { resolveRegisteredWorktreePath } from '../worktrees/removal/registered-worktree-roots-cache'
import { getLocalGitOptionsForRegisteredWorktree } from '../local-worktree-runtime-options'
import {
  validateFullGitObjectId,
  validateGitRelativeFilePath
} from './access/filesystem-path-containment'
import type { FilesystemHandlerContext } from './filesystem-handler-context'
import { requireReachableGitRoute } from '../../providers/execution-host-provider-dispatch'
import { getConnectionExecutionHostId } from '../../../shared/execution-host'
import { readWorktreeGitUnlessWslStopped } from './wsl-gated-worktree-git-read'

export function registerFilesystemGitDiffHandlers(context: FilesystemHandlerContext): void {
  const { store } = context
  registrarBaseDelBorde(context)
  ipcMain.handle(
    'git:branchDiff',
    async (
      _event,
      args: {
        worktreePath: string
        compare: {
          baseRef: string
          baseOid: string
          headOid: string
          mergeBase: string
        }
        filePath: string
        oldPath?: string
        connectionId?: string
        /** Showing the diff tab or its Retry: a user act that may start a stopped WSL distro. */
        wakeWslDistro?: boolean
      }
    ): Promise<GitDiffResult> => {
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      return readWorktreeGitUnlessWslStopped(
        store,
        args.worktreePath,
        args.wakeWslDistro,
        (worktreePath, gitOptions) =>
          getBranchDiff(
            worktreePath,
            {
              mergeBase: args.compare.mergeBase,
              headOid: args.compare.headOid,
              filePath: validateGitRelativeFilePath(worktreePath, args.filePath),
              oldPath: args.oldPath
                ? validateGitRelativeFilePath(worktreePath, args.oldPath)
                : undefined
            },
            { ...gitOptions, admissionTier: 'interactive' }
          )
      )
    }
  )

  ipcMain.handle(
    'git:commitDiff',
    async (
      _event,
      args: {
        worktreePath: string
        commitOid: string
        parentOid?: string | null
        filePath: string
        oldPath?: string
        connectionId?: string
        /** Showing the diff tab or its Retry: a user act that may start a stopped WSL distro. */
        wakeWslDistro?: boolean
      }
    ): Promise<GitDiffResult> => {
      const commitOid = validateFullGitObjectId(args.commitOid, 'commitOid')
      const parentOid = args.parentOid ? validateFullGitObjectId(args.parentOid, 'parentOid') : null
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      return readWorktreeGitUnlessWslStopped(
        store,
        args.worktreePath,
        args.wakeWslDistro,
        (worktreePath, gitOptions) =>
          getCommitDiff(
            worktreePath,
            {
              commitOid,
              parentOid,
              filePath: validateGitRelativeFilePath(worktreePath, args.filePath),
              oldPath: args.oldPath
                ? validateGitRelativeFilePath(worktreePath, args.oldPath)
                : undefined
            },
            { ...gitOptions, admissionTier: 'interactive' }
          )
      )
    }
  )
}

/**
 * Lo que el borde de git del editor compara contra lo que hay en pantalla.
 *
 * Es el índice si el archivo está preparado y HEAD si no, igual que la rayita de VS Code: una vez
 * que agregaste un cambio al índice, deja de aparecer como pendiente.
 *
 * `failed` no es lo mismo que «no existe» y por eso viaja tal cual: un archivo nuevo y un `git
 * show` que no pudo correr dan los dos un lado vacío, y pintar el archivo entero como agregado
 * porque git no contestó es decirle a la persona algo que no es cierto.
 */
function registrarBaseDelBorde(context: FilesystemHandlerContext): void {
  const { store } = context
  ipcMain.handle(
    'git:fileBaseForGutter',
    async (
      _event,
      args: { worktreePath: string; filePath: string; connectionId?: string }
    ): Promise<{ content: string; exists: boolean; isBinary: boolean; failed: boolean }> => {
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const filePath = validateGitRelativeFilePath(worktreePath, args.filePath)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      const blob = await readUnstagedLeftBlob(worktreePath, filePath, gitOptions)
      return {
        content: blob.content,
        exists: blob.exists,
        isBinary: blob.isBinary,
        failed: blob.failed === true
      }
    }
  )
}
