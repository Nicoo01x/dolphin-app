import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import {
  branchFromRuntimeGit,
  cherryPickRuntimeGit,
  revertRuntimeGit
} from '@/runtime/runtime-git-commit-actions-client'
import type { RuntimeGitContext } from '@/runtime/source-control/git/runtime-git-client-context'
import type {
  GitCommitAction,
  GitCommitActionResult
} from '../../../../../../shared/git-commit-action'

/**
 * Corre una de las tres acciones que TOCAN un commit —traerlo, deshacerlo, empezar una rama en
 * él— y cuenta qué pasó.
 *
 * Why cada resultado con su tono: un conflicto no es un error —git lo dejó puesto y se resuelve
 * en Cambios, que está al lado— y un commit que ya estaba tampoco. Mostrando los tres como error
 * se pierde la única diferencia que importa: si hay algo que hacer ahora.
 */
export async function correrAccionDeCommit(
  contexto: RuntimeGitContext,
  accion: GitCommitAction,
  commitId: string
): Promise<void> {
  const traer = accion === 'cherry-pick'
  try {
    const resultado = await correr(contexto, accion, commitId)
    if (accion === 'branch-from') {
      toast.success(
        translate(
          'auto.components.right.sidebar.SourceControl.branchFromDone',
          "You're on {{branch}}",
          {
            branch: resultado.branch ?? ''
          }
        )
      )
      return
    }
    if (resultado.outcome === 'conflicted') {
      toast.warning(
        traer
          ? translate(
              'auto.components.right.sidebar.SourceControl.cherryPickConflict',
              'The commit clashed. Resolve the conflicts in Changes.'
            )
          : translate(
              'auto.components.right.sidebar.SourceControl.revertConflict',
              'Reverting it clashed. Resolve the conflicts in Changes.'
            )
      )
      return
    }
    if (resultado.outcome === 'empty') {
      toast.info(
        translate(
          'auto.components.right.sidebar.SourceControl.commitActionEmpty',
          'Nothing changed: that commit was already here.'
        )
      )
      return
    }
    toast.success(
      traer
        ? translate(
            'auto.components.right.sidebar.SourceControl.cherryPickDone',
            'Commit brought over'
          )
        : translate('auto.components.right.sidebar.SourceControl.revertDone', 'Commit reverted')
    )
  } catch (error) {
    // Lo que dijo git, tal cual: es más útil que cualquier frase nuestra.
    toast.error(error instanceof Error ? error.message : String(error))
  }
}

function correr(
  contexto: RuntimeGitContext,
  accion: GitCommitAction,
  commitId: string
): Promise<GitCommitActionResult> {
  if (accion === 'cherry-pick') {
    return cherryPickRuntimeGit(contexto, { commitId })
  }
  if (accion === 'revert') {
    return revertRuntimeGit(contexto, { commitId })
  }
  return branchFromRuntimeGit(contexto, { commitId })
}
