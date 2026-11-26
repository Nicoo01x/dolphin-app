import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

/**
 * Buscar un ensamblado fuera de la salida de su proyecto. En un disco lento listar una carpeta fría
 * tarda decenas de milisegundos y un repositorio grande tiene miles, así que todo tiene tope.
 */

export type Entrada = { nombre: string; carpeta: boolean }

export async function listar(carpeta: string): Promise<Entrada[]> {
  try {
    const entradas = await readdir(carpeta, { withFileTypes: true })
    return entradas.map((e) => ({ nombre: e.name, carpeta: e.isDirectory() }))
  } catch {
    return []
  }
}

/** Carpetas que nunca tienen un build útil y sí miles de archivos. */
const SIN_BUILDS = new Set([
  '.git',
  '.svn',
  '.vs',
  '.idea',
  'node_modules',
  'obj',
  'packages',
  'TestResults',
  '_ReSharper.Caches'
])

/** Nombres de carpeta donde suele haber builds: se recorren antes que el resto. */
const PROMETEDORAS =
  /^(bin|debug|release|x86|x64|deploy.*|.*deploy|assembl.*|.*common.*|lib|libs|dlls?|output|build|dist|publish)$/i

export type Limites = { profundidad: number; carpetas: number; msMaximo: number }

export type Copias = { copias: string[]; soluciones: string[] }

/**
 * Copias de `nombreArchivo` debajo de `raiz`, y de paso las .sln que aparezcan. Primero lo poco
 * profundo y lo prometedor (bin, Debug, Deploy…): la prioridad es la profundidad menos un premio.
 */
export async function buscarCopias(
  raiz: string,
  nombreArchivo: string,
  limites: Limites = { profundidad: 6, carpetas: 4000, msMaximo: 5000 }
): Promise<Copias> {
  const copias: string[] = []
  const soluciones: string[] = []
  const buscado = nombreArchivo.toLowerCase()
  const fin = Date.now() + limites.msMaximo
  const pendientes: { carpeta: string; profundidad: number; prioridad: number }[] = [
    { carpeta: raiz, profundidad: 0, prioridad: 0 }
  ]
  let visitadas = 0
  while (pendientes.length > 0 && visitadas < limites.carpetas && Date.now() <= fin) {
    let mejor = 0
    for (let i = 1; i < pendientes.length; i++) {
      if ((pendientes[i]?.prioridad ?? 0) < (pendientes[mejor]?.prioridad ?? 0)) {
        mejor = i
      }
    }
    const [actual] = pendientes.splice(mejor, 1)
    if (!actual) {
      break
    }
    visitadas++
    for (const entrada of await listar(actual.carpeta)) {
      const ruta = join(actual.carpeta, entrada.nombre)
      if (entrada.carpeta) {
        const profundidad = actual.profundidad + 1
        if (
          profundidad <= limites.profundidad &&
          !SIN_BUILDS.has(entrada.nombre) &&
          !entrada.nombre.startsWith('.')
        ) {
          const premio = PROMETEDORAS.test(entrada.nombre) ? 2.5 : 0
          pendientes.push({ carpeta: ruta, profundidad, prioridad: profundidad - premio })
        }
      } else if (entrada.nombre.toLowerCase() === buscado) {
        copias.push(ruta)
      } else if (/\.sln$/i.test(entrada.nombre)) {
        soluciones.push(ruta)
      }
    }
  }
  return { copias, soluciones }
}

/** Los .csproj que lista una solución, con ruta absoluta. */
export function proyectosDeSolucion(sln: string, contenido: string): string[] {
  return [...contenido.matchAll(/^Project\([^)]*\)\s*=\s*"[^"]*",\s*"([^"]+\.csproj)"/gim)].map(
    (m) => resolve(dirname(sln), (m[1] ?? '').replace(/\\/g, '/'))
  )
}

/** Las .sln de la carpeta del proyecto y de sus dos carpetas de arriba. */
export async function solucionesCercanas(carpetaProyecto: string): Promise<string[]> {
  const carpetas = [carpetaProyecto, dirname(carpetaProyecto), dirname(dirname(carpetaProyecto))]
  const soluciones: string[] = []
  for (const carpeta of new Set(carpetas)) {
    for (const entrada of await listar(carpeta)) {
      if (!entrada.carpeta && /\.sln$/i.test(entrada.nombre)) {
        soluciones.push(join(carpeta, entrada.nombre))
      }
    }
  }
  return soluciones
}

/**
 * Los otros proyectos de las soluciones que incluyen al nuestro: uno que lo referencia recibe una
 * copia del ensamblado en su bin al compilar.
 */
export async function proyectosVecinos(
  proyecto: string,
  soluciones: readonly string[]
): Promise<string[]> {
  const propio = resolve(proyecto).toLowerCase()
  const vecinos = new Set<string>()
  for (const sln of new Set(soluciones)) {
    const contenido = await readFile(sln, 'utf8').catch(() => '')
    const proyectos = proyectosDeSolucion(sln, contenido)
    if (!proyectos.some((p) => p.toLowerCase() === propio)) {
      continue
    }
    for (const vecino of proyectos) {
      if (vecino.toLowerCase() !== propio) {
        vecinos.add(vecino)
      }
    }
  }
  return [...vecinos]
}
