import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  comoTarjetaDelTablero,
  type TableroLeido,
  type TarjetaDelTablero
} from '../../shared/dolphin-tablero-types'

type Disco = {
  listar: (carpeta: string) => Promise<string[]>
  leer: (ruta: string) => Promise<string>
}

const disco: Disco = {
  listar: (carpeta) => readdir(carpeta),
  leer: (ruta) => readFile(ruta, 'utf8')
}

/**
 * Las tarjetas del tablero de un repo (`.dolphin/tablero/<id>.json`). Se lee del disco, igual que la
 * bandeja de la isla: no depende de que la consola del repo esté abierta. Un repo sin carpeta, o con
 * archivos que no se entienden, simplemente aporta menos tarjetas.
 */
export async function leerTableroDeRepo(
  repoPath: string,
  usar: Disco = disco
): Promise<TableroLeido> {
  const carpeta = join(repoPath, '.dolphin', 'tablero')
  const nombres = await usar.listar(carpeta).catch(() => null)
  if (nombres === null) {
    return { ok: false }
  }
  const leidas = await Promise.all(
    nombres
      .filter((nombre) => nombre.endsWith('.json'))
      .map(async (nombre): Promise<TarjetaDelTablero | undefined> => {
        try {
          return comoTarjetaDelTablero(JSON.parse(await usar.leer(join(carpeta, nombre))))
        } catch {
          return undefined
        }
      })
  )
  return { ok: true, tarjetas: leidas.filter((t): t is TarjetaDelTablero => t !== undefined) }
}
