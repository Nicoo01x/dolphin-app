import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import {
  ajustesParaElArchivo,
  parsearEditorconfig,
  type AjustesDelProyecto,
  type ArchivoEditorconfig
} from '../../shared/editorconfig'

/**
 * Buscar los `.editorconfig` que mandan sobre un archivo, y leerlos.
 *
 * El recorrido es el del estándar: desde la carpeta del archivo hacia arriba, parando en el
 * primero que diga `root = true`. Lo que sale se aplica del más lejano al más cercano, así el de
 * una subcarpeta le gana al de la raíz.
 *
 * Dos límites propios, los dos por la misma razón —esto corre cada vez que se abre un archivo y
 * no puede costar nada—: no se sube más allá del worktree, y hay un tope de carpetas por si
 * alguna vez se lo llama con una ruta que no cuelga de ninguno.
 */

/** Hasta cuántas carpetas se sube. Un árbol más hondo que esto no existe en la práctica. */
const TOPE_DE_CARPETAS = 40

export type LectorDeArchivos = (ruta: string) => Promise<string | null>

const leerSiEsta: LectorDeArchivos = async (ruta) => {
  try {
    return await readFile(ruta, 'utf8')
  } catch {
    // No estar es el caso normal: la mayoría de las carpetas no tienen `.editorconfig`.
    return null
  }
}

/**
 * Los ajustes que el proyecto declara para ese archivo.
 *
 * `rutaDelArchivo` y `raiz` son absolutas. Si el archivo no cuelga de la raíz se devuelve vacío en
 * vez de salir a recorrer el disco de alguien.
 */
export async function ajustesDelProyectoPara(
  rutaDelArchivo: string,
  raiz: string,
  leer: LectorDeArchivos = leerSiEsta
): Promise<AjustesDelProyecto> {
  const archivo = resolve(rutaDelArchivo)
  const tope = resolve(raiz)
  if (!estaAdentro(archivo, tope)) {
    return {}
  }

  // Del más cercano al más lejano mientras se busca; se da vuelta al final para aplicarlos.
  const encontrados: { contenido: ArchivoEditorconfig; rutaRelativa: string }[] = []
  let carpeta = dirname(archivo)
  for (let i = 0; i < TOPE_DE_CARPETAS; i++) {
    // Cualquier error de lectura se trata como «no está». Un `.editorconfig` sin permisos en una
    // carpeta del medio no puede impedir abrir el archivo: se pierde esa capa y nada más.
    const texto = await leer(resolve(carpeta, '.editorconfig')).catch(() => null)
    if (texto !== null) {
      const contenido = parsearEditorconfig(texto)
      // El glob se evalúa contra la ruta relativa a la carpeta del `.editorconfig`, no a la raíz:
      // un `[*.ts]` en `src/` habla de los `.ts` de `src/`, no de los de todo el repo.
      encontrados.push({ contenido, rutaRelativa: aBarras(relative(carpeta, archivo)) })
      if (contenido.root) {
        break
      }
    }
    if (resolve(carpeta) === tope) {
      break
    }
    const arriba = dirname(carpeta)
    if (arriba === carpeta) {
      break
    }
    carpeta = arriba
  }

  // Se juntaron del más cercano al más lejano; se aplican al revés, que es el orden del estándar.
  return ajustesParaElArchivo(encontrados.toReversed())
}

/** Windows usa `\` y los globs del estándar hablan en `/`. */
function aBarras(ruta: string): string {
  return sep === '/' ? ruta : ruta.split(sep).join('/')
}

function estaAdentro(archivo: string, raiz: string): boolean {
  const r = relative(raiz, archivo)
  // En Windows, `relative` entre dos discos distintos devuelve una ruta absoluta: eso también es
  // «está afuera», y sin el `isAbsolute` pasaba la guardia.
  return r !== '' && !r.startsWith('..') && !isAbsolute(r)
}
