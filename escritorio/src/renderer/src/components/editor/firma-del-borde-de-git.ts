import type { GitStatusEntry } from '../../../../shared/git/status/git-status-types'

/**
 * Lo que tiene que cambiar para que el borde de git vuelva a leer su base.
 *
 * La base es lo que dice el índice (o HEAD) del archivo, y la mueven dos cosas: un commit, que
 * cambia HEAD, y un `git add`, que cambia en qué área figura el archivo. Las dos llegan al store
 * con el sondeo de `git status` de la base, así que de ahí se arma la firma: si el agente commitea,
 * el borde se refresca solo en vez de quedar viejo hasta reabrir el archivo.
 *
 * Es un texto y no un objeto para que el selector del store compare por valor y no repinte en
 * cada sondeo que no cambió nada.
 */
export function firmaDelBordeDeGit(
  head: string | undefined,
  entradas: readonly GitStatusEntry[] | undefined,
  rutaRelativa: string
): string {
  const ruta = rutaRelativa.replace(/\\/g, '/')
  const delArchivo = (entradas ?? [])
    .filter((entrada) => entrada.path.replace(/\\/g, '/') === ruta)
    .map((entrada) => `${entrada.area}:${entrada.status}`)
    .sort()
    .join(',')
  return `${head ?? ''}|${delArchivo}`
}
