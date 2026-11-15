import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { AsuntoDeIsla } from '../../shared/dolphin-isla-types'

/** Cuántos asuntos muestra la isla: es un vistazo, la bandeja entera está en Dolphin. */
const A_LA_VISTA = 12

type RepoLocal = { path: string; displayName?: string | null }
type LeerArchivo = (ruta: string) => Promise<string>

function asuntosAbiertos(contenido: string, repo: string): AsuntoDeIsla[] {
  let datos: unknown
  try {
    datos = JSON.parse(contenido)
  } catch {
    return []
  }
  const asuntos = (datos as { asuntos?: unknown })?.asuntos
  if (!Array.isArray(asuntos)) {
    return []
  }
  return asuntos.flatMap((asunto: Record<string, unknown>): AsuntoDeIsla[] => {
    const { id, tipo, titulo, creado, estado } = asunto ?? {}
    // Lo que se está implementando sigue abierto: todavía no se resolvió.
    if (
      (estado !== 'abierto' && estado !== 'implementando') ||
      (tipo !== 'idea' && tipo !== 'error') ||
      typeof id !== 'string' ||
      typeof titulo !== 'string' ||
      typeof creado !== 'string'
    ) {
      return []
    }
    return [{ id, repo, tipo, titulo, creado }]
  })
}

/**
 * Los asuntos abiertos de la bandeja de Dolphin (`.dolphin/bandeja.json`) de cada repo de la app, los
 * más nuevos primero. Se lee del disco: no depende de que la consola de ese repo esté abierta. Un repo
 * sin bandeja, o con una que no se entiende, no aporta nada.
 */
export async function leerBandejasDeIsla(
  repos: readonly RepoLocal[],
  leer: LeerArchivo = (ruta) => readFile(ruta, 'utf8')
): Promise<AsuntoDeIsla[]> {
  const porRepo = await Promise.all(
    repos.map(async (repo) => {
      const contenido = await leer(join(repo.path, '.dolphin', 'bandeja.json')).catch(() => null)
      return contenido === null
        ? []
        : asuntosAbiertos(contenido, repo.displayName || basename(repo.path))
    })
  )
  return porRepo
    .flat()
    .sort((a, b) => b.creado.localeCompare(a.creado))
    .slice(0, A_LA_VISTA)
}
