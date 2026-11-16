import { join } from 'node:path'
import { rutaExiste } from './ruta-existe'

/**
 * Con qué se lanza un comando del núcleo de Dolphin (`ui-cli`, `dolphin`…) que está en `dir`, o
 * null si ahí no hay núcleo:
 * - un clon del núcleo (src/ y tsx): el código fuente, con tsx;
 * - el núcleo construido que viaja en el instalador (resources/dolphin-app): dist/, JavaScript
 *   plano, sin tsx ni node_modules (el núcleo no tiene dependencias en runtime).
 * Se corre con el Electron de la app como Node (ELECTRON_RUN_AS_NODE): no hace falta Node.
 * Why el código primero: en un clon que además construyó dist/, lo que vale es lo que se está
 * editando y no una compilación vieja (lo mismo hace bin/dolphin.mjs).
 */
export async function coreEntry(dir: string, script: string): Promise<readonly string[] | null> {
  const source = join(dir, 'src', `${script}.ts`)
  if (
    (await rutaExiste(source)) &&
    (await rutaExiste(join(dir, 'node_modules', 'tsx', 'package.json')))
  ) {
    // Why --import y no el cli de tsx: el cli lanza otro proceso, y en Windows matar al hijo deja
    // al nieto corriendo. Así es uno solo (como lanza Dolphin sus propios procesos).
    return ['--import', 'tsx', source]
  }
  const built = join(dir, 'dist', `${script}.js`)
  return (await rutaExiste(built)) ? [built] : null
}
