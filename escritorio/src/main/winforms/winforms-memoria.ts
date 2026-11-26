import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

/**
 * Qué build funcionó para cada proyecto y qué copias se encontraron: la segunda vez que se abre un
 * formulario no se recorre el disco ni se prueban builds que ya fallaron.
 */

export type RecuerdoDeProyecto = { funciono: string | null; conocidos: string[] }

export type MemoriaDeBuilds = {
  leer: (proyecto: string) => RecuerdoDeProyecto
  recordar: (proyecto: string, cambio: Partial<RecuerdoDeProyecto>) => void
}

const MAX_PROYECTOS = 200

export function memoriaEnArchivo(ruta: string): MemoriaDeBuilds {
  let datos: Record<string, RecuerdoDeProyecto> = {}
  try {
    const crudo = JSON.parse(readFileSync(ruta, 'utf8')) as unknown
    if (crudo && typeof crudo === 'object') {
      datos = crudo as Record<string, RecuerdoDeProyecto>
    }
  } catch {
    // Primera vez, o un archivo roto: se empieza de cero.
  }
  let guardando: Promise<void> = Promise.resolve()
  const guardar = (): void => {
    const copia = JSON.stringify(datos)
    guardando = guardando.then(() => writeFile(ruta, copia, 'utf8').catch(() => undefined))
  }
  const clave = (proyecto: string): string => proyecto.toLowerCase()
  return {
    leer: (proyecto) => {
      const r = datos[clave(proyecto)]
      return {
        funciono: typeof r?.funciono === 'string' ? r.funciono : null,
        conocidos: Array.isArray(r?.conocidos)
          ? r.conocidos.filter((c): c is string => typeof c === 'string')
          : []
      }
    },
    recordar: (proyecto, cambio) => {
      const k = clave(proyecto)
      const previo = datos[k] ?? { funciono: null, conocidos: [] }
      const conocidos = [...new Set([...(previo.conocidos ?? []), ...(cambio.conocidos ?? [])])]
      const siguiente = { ...previo, ...cambio, conocidos: conocidos.slice(-20) }
      const { [k]: _anterior, ...resto } = datos
      const claves = Object.keys(resto)
      datos = Object.fromEntries([
        ...claves.slice(Math.max(0, claves.length - MAX_PROYECTOS + 1)).map((c) => [c, resto[c]]),
        [k, siguiente]
      ]) as Record<string, RecuerdoDeProyecto>
      guardar()
    }
  }
}
