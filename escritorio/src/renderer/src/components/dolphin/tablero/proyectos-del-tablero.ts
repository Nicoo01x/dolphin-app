import type { ProyectoDelTablero } from './TableroDelInicio'

/**
 * Un proyecto por repo, con el primer espacio de trabajo que tenga: con él el proceso principal
 * encuentra el repo y lee su tablero. Un repo sin espacios no aparece (no hay por dónde leerlo), y
 * el orden es el de `repos`, para que «el primero con tarjetas» no cambie de un render al otro.
 */
export function proyectosDelTablero(
  repos: readonly { id: string; displayName: string }[],
  worktreesPorRepo: Readonly<Record<string, readonly { id: string }[]>>
): ProyectoDelTablero[] {
  return repos.flatMap((repo) => {
    const primero = worktreesPorRepo[repo.id]?.[0]
    return primero ? [{ worktreeId: primero.id, repoId: repo.id, nombre: repo.displayName }] : []
  })
}
