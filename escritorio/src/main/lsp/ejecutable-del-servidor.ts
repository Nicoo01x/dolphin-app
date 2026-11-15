/**
 * Dónde está el ejecutable de un servidor de lenguaje, o null si no está instalado.
 *
 * Why buscarlo antes de lanzarlo: en Windows, npm instala `typescript-language-server.cmd` (y un
 * script sin extensión que sólo entiende bash). Lanzar el nombre pelado con `shell: false` da
 * ENOENT aunque `where` lo encuentre, y el process-host sólo sabe leer el shim de npm cuando le
 * llega la ruta del `.cmd`. Es el mismo camino que usa la base para los CLIs de los agentes
 * (`resolveCliCommandAsync`): PATH primero, después las carpetas donde instalan npm, pnpm, volta…
 * —una app abierta desde el menú de inicio puede no heredar el PATH del usuario—, y en Windows
 * prueba `.cmd`, `.exe` y `.bat` antes que el nombre pelado.
 */

import { isAbsolute } from 'node:path'
import { resolveCliCommandAsync } from '../../shared/node-cli-command-async-resolution'
import type { ResolveCommandOptions } from '../../shared/node-cli-command-resolution'
import type { ServidorDeLenguaje } from '../../shared/lsp/servidores'

export async function ejecutableDelServidor(
  servidor: Pick<ServidorDeLenguaje, 'comando'>,
  opciones: ResolveCommandOptions = {}
): Promise<string | null> {
  const resuelto = await resolveCliCommandAsync(servidor.comando, opciones)
  // Sin encontrarlo, la búsqueda devuelve el nombre tal cual: eso es «no está», no una ruta.
  return isAbsolute(resuelto) ? resuelto : null
}
