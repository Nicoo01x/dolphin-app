import type { GitCommitActionResult } from '../../shared/git/commands/git-commit-action'
import { gitOptionsForWorktree, type GitRuntimeOptions } from './git-runtime-options'
import { gitExecFileAsync } from './runner'
import { runWithGitReadCacheInvalidation } from './source-control/git-read-cache-invalidation'

/**
 * Rechaza lo que git parsearía como una opción (`-`/`--…`) o que no puede ser un commit.
 *
 * Defensa en profundidad: quien llama también valida en el esquema del RPC, pero el punto de
 * entrada del relay se alcanza por su cuenta, así que el ayudante también mira. Es la misma
 * razón por la que `assertValidBranchName` existe al lado de su esquema.
 */
export function assertValidCommitId(commitId: string): void {
  if (!/^[0-9a-fA-F]{4,40}$/.test(commitId)) {
    throw new Error('invalid_commit_id')
  }
}

/** Un conflicto deja el árbol a medias y git lo dice en su salida, no en el código de salida. */
const DEJO_CONFLICTO = /conflict|CONFLICT|could not apply|after resolving the conflicts/i
/** Cherry-pick de algo que ya está, o revert de algo que no cambió nada. */
const NO_CAMBIO_NADA = /nothing to commit|previous cherry-pick is now empty|allow-empty/i

async function correr(
  worktreePath: string,
  argumentos: readonly string[],
  options: GitRuntimeOptions
): Promise<GitCommitActionResult> {
  try {
    await runWithGitReadCacheInvalidation(() =>
      gitExecFileAsync([...argumentos], gitOptionsForWorktree(worktreePath, options))
    )
  } catch (error) {
    const salida = error instanceof Error ? error.message : String(error)
    if (DEJO_CONFLICTO.test(salida)) {
      return { outcome: 'conflicted', message: salida }
    }
    if (NO_CAMBIO_NADA.test(salida)) {
      return { outcome: 'empty', message: salida }
    }
    throw error
  }
  const { stdout } = await gitExecFileAsync(
    ['rev-parse', 'HEAD'],
    gitOptionsForWorktree(worktreePath, options)
  )
  return { outcome: 'landed', commitId: stdout.trim() }
}

/** Cuántos sufijos probar antes de rendirse: con 20 ramas del mismo commit, el problema es otro. */
const MAXIMO_INTENTOS_DE_NOMBRE = 20

/**
 * El primer nombre libre de la serie `base`, `base-2`, `base-3`…
 *
 * Why preguntar en vez de dejar fallar: la acción se dispara con un clic y sin escribir nada, así
 * que «ya existe una rama con ese nombre» sería un error que la persona no puede arreglar desde
 * donde está. Buscar el nombre es lo que la hace un clic de verdad.
 */
async function nombreLibreDeRama(
  worktreePath: string,
  base: string,
  options: GitRuntimeOptions
): Promise<string> {
  for (let intento = 1; intento <= MAXIMO_INTENTOS_DE_NOMBRE; intento += 1) {
    const nombre = intento === 1 ? base : `${base}-${intento}`
    try {
      await gitExecFileAsync(
        ['rev-parse', '--verify', '--quiet', `refs/heads/${nombre}`],
        gitOptionsForWorktree(worktreePath, options)
      )
    } catch {
      // Why el catch como camino bueno: `rev-parse --verify` sale distinto de cero cuando la ref
      // NO existe, y eso es justo lo que se está buscando.
      return nombre
    }
  }
  throw new Error('branch_name_taken')
}

/**
 * Empieza una rama en ese commit y se para ahí.
 *
 * Why una rama y no un `checkout` pelado del commit: eso deja la cabeza desprendida, que es un
 * estado del que hay que saber salir y que pierde cualquier commit que se haga ahí sin avisar.
 * Con una rama, lo que se escriba tiene nombre y sigue estando mañana.
 */
export async function branchFromCommit(
  worktreePath: string,
  commitId: string,
  options: GitRuntimeOptions = {}
): Promise<GitCommitActionResult> {
  assertValidCommitId(commitId)
  const branch = await nombreLibreDeRama(worktreePath, `from-${commitId.slice(0, 7)}`, options)
  await runWithGitReadCacheInvalidation(() =>
    gitExecFileAsync(
      ['checkout', '-b', branch, commitId, '--'],
      gitOptionsForWorktree(worktreePath, options)
    )
  )
  return { outcome: 'landed', commitId, branch }
}

/**
 * Trae un commit de otra rama a esta.
 *
 * Why sin `--no-commit`: el commit que queda es lo que la persona pidió, y dejándolo en el índice
 * habría que explicarle que tiene que confirmarlo ella. Si choca, git deja el conflicto puesto y
 * el resultado lo dice, que es lo que permite ofrecer «resolver» o «abortar».
 */
export async function cherryPickCommit(
  worktreePath: string,
  commitId: string,
  options: GitRuntimeOptions = {}
): Promise<GitCommitActionResult> {
  assertValidCommitId(commitId)
  return correr(worktreePath, ['cherry-pick', commitId], options)
}

/**
 * Deshace un commit con otro commit encima.
 *
 * Why `--no-edit`: sin eso git abre un editor, y acá no hay ninguno esperando. El mensaje que
 * pone solo —«Revert "lo que decía el original"»— es el que alguien escribiría igual.
 */
export async function revertCommit(
  worktreePath: string,
  commitId: string,
  options: GitRuntimeOptions = {}
): Promise<GitCommitActionResult> {
  assertValidCommitId(commitId)
  return correr(worktreePath, ['revert', '--no-edit', commitId], options)
}
