import type { RemoteInstallTransport } from '../managed-server/install/remote-install-transport'
import {
  uploadRemoteInstallDirectory,
  writeRemoteInstallFile
} from '../managed-server/install/remote-install-transfers'
import { execCommand } from '../ssh/remote-exec/remote-exec-command'
import { detectRemoteHostPlatform } from '../ssh/remote-host/ssh-remote-platform-detection'
import type { RemoteHostPlatform } from '../ssh/remote-host/ssh-remote-platform'
import { quotePosixShell } from '../../shared/shell/launch/shell-argument-quoting'

/**
 * Un servidor conectado por SSH, reducido a lo que hace falta para llevarle un bot: correr un
 * comando y subir una carpeta. Así el plan (`delfines-llevar.ts`) se prueba con un doble, sin VPS.
 */
export type Remoto = {
  correr: (
    script: string,
    opciones?: { esperaMs?: number; entrada?: string }
  ) => Promise<{ codigo: number; salida: string }>
  subirCarpeta: (local: string, remota: string) => Promise<void>
  escribir: (remota: string, contenido: string) => Promise<void>
}

/**
 * Lo que un comando no interactivo por SSH no trae y el bot necesita: dónde suelen instalarse
 * `claude` y `codex` sin root. Un shell de login no siempre los suma (`.bashrc` corta temprano si
 * no es interactivo), y sin ellos el servidor parece no tener el motor que sí tiene.
 */
export const PATH_DEL_SERVIDOR =
  'export PATH="$HOME/.local/bin:$HOME/.claude/local:$HOME/.npm-global/bin:$HOME/.bun/bin:$PATH"'

/** El final del script, para leer el código de salida sin que un no-cero se vuelva una excepción. */
const MARCA_DE_FIN = 'DOLPHIN_DELFIN_FIN:'
const ESPERA_POR_DEFECTO_MS = 60_000

export function envolverScript(script: string): string {
  // El script corre en un sh de login (para que lea el perfil de la persona) y adentro, con el PATH
  // ampliado. El código de salida se imprime al final: un fallo es una respuesta, no un error.
  const cuerpo = `${PATH_DEL_SERVIDOR}\n${script}`
  return `sh -lc ${quotePosixShell(cuerpo)} 2>&1; printf '\\n%s%s\\n' '${MARCA_DE_FIN}' "$?"`
}

export function leerSalidaEnvuelta(salida: string): { codigo: number; salida: string } {
  const indice = salida.lastIndexOf(MARCA_DE_FIN)
  if (indice === -1) {
    return { codigo: 255, salida: salida.trim() }
  }
  const codigo = Number.parseInt(salida.slice(indice + MARCA_DE_FIN.length), 10)
  return { codigo: Number.isInteger(codigo) ? codigo : 255, salida: salida.slice(0, indice).trim() }
}

/** El servidor, por la conexión SSH que la app ya tiene abierta. */
export async function remotoPorSsh(conn: RemoteInstallTransport): Promise<{
  remoto: Remoto
  plataforma: RemoteHostPlatform | null
}> {
  const plataforma = await detectRemoteHostPlatform(conn).catch(() => null)
  const remoto: Remoto = {
    correr: async (script, { esperaMs = ESPERA_POR_DEFECTO_MS, entrada } = {}) => {
      const { Readable } = await import('node:stream')
      const salida = await execCommand(conn, envolverScript(script), {
        timeoutMs: esperaMs,
        ...(entrada !== undefined ? { stdin: Readable.from([entrada]) } : {})
      })
      return leerSalidaEnvuelta(salida)
    },
    subirCarpeta: async (local, remota) => {
      if (!plataforma) {
        throw new Error('no se pudo saber qué sistema tiene el servidor')
      }
      await uploadRemoteInstallDirectory(conn, local, remota, plataforma)
    },
    escribir: async (remota, contenido) => {
      if (!plataforma) {
        throw new Error('no se pudo saber qué sistema tiene el servidor')
      }
      await writeRemoteInstallFile(conn, plataforma, remota, contenido)
    }
  }
  return { remoto, plataforma }
}
