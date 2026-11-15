/**
 * Traer un commit de otra rama, o deshacerlo con otro commit encima.
 *
 * Why el tipo acá y no al lado de la implementación: lo leen el main, el preload y el renderer,
 * y un tipo que el renderer importa de `main/` no entra en su tsconfig. Es un contrato entre los
 * tres, así que vive donde los tres pueden verlo.
 */
export type GitCommitAction = 'cherry-pick' | 'revert' | 'branch-from'

// Why: el resultado es el de la base (`git/commands/git-commit-action.ts`), que ya trae cherry-pick
// y revert; acá queda sólo la acción propia de Dolphin, «empezar una rama en este commit».
export type { GitCommitActionResult } from './git/commands/git-commit-action'
