import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

/**
 * La huella del núcleo que la app tiene acá (bin/, dist/ y package.json): si la del servidor es la
 * misma, no se vuelve a subir. Mira nombres, tamaños y fechas, no el contenido entero: son 2 MB en
 * 250 archivos y esto corre cada vez que se lleva un bot.
 */
async function archivosDe(carpeta: string): Promise<string[]> {
  const entradas = await readdir(carpeta, { recursive: true, withFileTypes: true })
  return entradas
    .filter((entrada) => entrada.isFile())
    .map((entrada) => join(entrada.parentPath, entrada.name))
}

export async function huellaDelNucleo(dir: string): Promise<string> {
  const hash = createHash('sha256')
  hash.update(await readFile(join(dir, 'package.json')))
  for (const sub of ['bin', 'dist']) {
    const archivos = (await archivosDe(join(dir, sub))).sort()
    for (const archivo of archivos) {
      const info = await stat(archivo)
      hash.update(`${relative(dir, archivo)}\0${info.size}\0${Math.trunc(info.mtimeMs)}\n`)
    }
  }
  return hash.digest('hex').slice(0, 32)
}
