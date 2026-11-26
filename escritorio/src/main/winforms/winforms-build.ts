import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { WinFormsBuild } from '../../shared/winforms/winforms-preview-types'
import { buscarCopias, listar, proyectosVecinos, solucionesCercanas } from './winforms-build-search'

/**
 * Dónde está compilado un formulario. Primero la salida que declara su .csproj (bin\Debug,
 * bin\Release…); si ahí no hay nada, el mismo ensamblado en el resto del repositorio (carpetas de
 * Deploy, ensamblados comunes, el bin de otro proyecto de la solución que lo referencia). La vista
 * previa usa el último build disponible: compilar no es su trabajo.
 */

export type Csproj = {
  nombreEnsamblado: string | null
  /** 'dll' para Library; 'exe' para Exe y WinExe. */
  extension: 'dll' | 'exe'
  salidas: string[]
}

const valoresDe = (xml: string, etiqueta: string): string[] =>
  [...xml.matchAll(new RegExp(`<${etiqueta}(?:\\s[^>]*)?>([^<]*)</${etiqueta}>`, 'gi'))]
    .map((m) => (m[1] ?? '').trim())
    .filter(Boolean)

export function leerCsproj(xml: string): Csproj {
  const tipoDeSalida = valoresDe(xml, 'OutputType')[0]?.toLowerCase() ?? 'library'
  const salidas = valoresDe(xml, 'OutputPath')
    .filter((s) => !s.includes('$('))
    .map((s) => s.replace(/\\/g, '/'))
  return {
    nombreEnsamblado: valoresDe(xml, 'AssemblyName')[0] ?? null,
    extension: tipoDeSalida === 'exe' || tipoDeSalida === 'winexe' ? 'exe' : 'dll',
    salidas: [...new Set(salidas)]
  }
}

async function existe(ruta: string): Promise<boolean> {
  try {
    await stat(ruta)
    return true
  } catch {
    return false
  }
}

/**
 * El .csproj del archivo: el más cercano hacia arriba. Si una carpeta tiene varios, el que lo nombra
 * en un `Compile Include` (los proyectos SDK incluyen todo, así que ahí gana el primero).
 */
export async function buscarProyecto(archivo: string, tope = 8): Promise<string | null> {
  let carpeta = dirname(archivo)
  for (let nivel = 0; nivel < tope; nivel++) {
    const proyectos = (await listar(carpeta))
      .filter((e) => !e.carpeta && /\.csproj$/i.test(e.nombre))
      .map((e) => join(carpeta, e.nombre))
    if (proyectos.length > 1) {
      const relativo = relative(carpeta, archivo).toLowerCase()
      for (const proyecto of proyectos) {
        const xml = (await readFile(proyecto, 'utf8').catch(() => '')).toLowerCase()
        if (xml.includes(relativo) || xml.includes(relativo.replace(/\//g, '\\'))) {
          return proyecto
        }
      }
    }
    if (proyectos.length > 0) {
      return proyectos[0] ?? null
    }
    const padre = dirname(carpeta)
    if (padre === carpeta) {
      return null
    }
    carpeta = padre
  }
  return null
}

/**
 * La raíz más externa con control de versiones (.git o .svn) encima de `desde`. La más externa porque
 * un checkout de SVN dentro de un repo de git (o un subproyecto) deja afuera las carpetas de Deploy.
 */
export async function raizDelRepositorio(desde: string, tope = 10): Promise<string | null> {
  let carpeta = desde
  let raiz: string | null = null
  for (let nivel = 0; nivel < tope; nivel++) {
    if ((await existe(join(carpeta, '.git'))) || (await existe(join(carpeta, '.svn')))) {
      raiz = carpeta
    }
    const padre = dirname(carpeta)
    if (padre === carpeta) {
      break
    }
    carpeta = padre
  }
  return raiz
}

/** Las salidas típicas además de las del .csproj (configuraciones con plataforma, SDK con TFM). */
export async function salidasDelProyecto(proyecto: string, csproj: Csproj): Promise<string[]> {
  const carpetaProyecto = dirname(proyecto)
  const carpetas = new Set(csproj.salidas.map((s) => resolve(carpetaProyecto, s)))
  const bin = join(carpetaProyecto, 'bin')
  for (const config of await listar(bin)) {
    if (!config.carpeta) {
      continue
    }
    const dentro = join(bin, config.nombre)
    carpetas.add(dentro)
    for (const sub of await listar(dentro)) {
      if (sub.carpeta) {
        carpetas.add(join(dentro, sub.nombre))
      }
    }
  }
  return [...carpetas]
}

export type BuscarBuilds = {
  proyecto: string
  csproj: Csproj
  /** Donde buscar copias si la salida del proyecto está vacía; null para no buscar. */
  raiz: string | null
  /** El build que funcionó la última vez, si sigue existiendo: va primero. */
  preferido?: string | null
  /** Builds de búsquedas anteriores: se revisan sin volver a recorrer el disco. */
  conocidos?: readonly string[]
}

export function archivoDelEnsamblado(proyecto: string, csproj: Csproj): string {
  return `${csproj.nombreEnsamblado ?? basename(proyecto, '.csproj')}.${csproj.extension}`
}

/** Los builds candidatos, el más nuevo primero (el preferido, si lo hay, adelante de todo). */
export async function buscarBuilds(pedido: BuscarBuilds): Promise<WinFormsBuild[]> {
  const archivo = archivoDelEnsamblado(pedido.proyecto, pedido.csproj)
  const vistos = new Map<string, WinFormsBuild>()
  const agregar = async (ruta: string, origen: WinFormsBuild['origen']): Promise<void> => {
    const clave = resolve(ruta).toLowerCase()
    if (vistos.has(clave)) {
      return
    }
    try {
      const info = await stat(ruta)
      if (info.isFile()) {
        vistos.set(clave, { ruta: resolve(ruta), modificado: info.mtimeMs, origen })
      }
    } catch {
      // No existe en esta salida: lo normal para la configuración que no se compiló.
    }
  }
  for (const carpeta of await salidasDelProyecto(pedido.proyecto, pedido.csproj)) {
    await agregar(join(carpeta, archivo), 'proyecto')
  }
  for (const conocido of pedido.conocidos ?? []) {
    await agregar(conocido, 'repositorio')
  }
  if (pedido.preferido) {
    await agregar(pedido.preferido, 'elegido')
  }
  if (vistos.size === 0 && pedido.raiz) {
    const { copias, soluciones } = await buscarCopias(pedido.raiz, archivo)
    for (const copia of copias) {
      await agregar(copia, 'repositorio')
    }
    const cercanas = await solucionesCercanas(dirname(pedido.proyecto))
    for (const vecino of await proyectosVecinos(pedido.proyecto, [...soluciones, ...cercanas])) {
      const xml = await readFile(vecino, 'utf8').catch(() => null)
      if (xml === null) {
        continue
      }
      for (const carpeta of await salidasDelProyecto(vecino, leerCsproj(xml))) {
        await agregar(join(carpeta, archivo), 'repositorio')
      }
    }
  }
  const builds = [...vistos.values()].sort((a, b) => b.modificado - a.modificado)
  const preferido = pedido.preferido ? resolve(pedido.preferido).toLowerCase() : null
  return preferido
    ? [
        ...builds.filter((b) => b.ruta.toLowerCase() === preferido),
        ...builds.filter((b) => b.ruta.toLowerCase() !== preferido)
      ]
    : builds
}

/** El archivo fuente más nuevo que el build, si lo hay: el build no tiene esos cambios. */
export async function fuenteMasNueva(
  build: WinFormsBuild,
  fuentes: readonly string[]
): Promise<{ fuente: string; modificado: number } | null> {
  let masNueva: { fuente: string; modificado: number } | null = null
  for (const fuente of fuentes) {
    try {
      const { mtimeMs } = await stat(fuente)
      // Un segundo de margen: copiar el build a otra carpeta puede redondear la fecha.
      if (mtimeMs > build.modificado + 1000 && (!masNueva || mtimeMs > masNueva.modificado)) {
        masNueva = { fuente, modificado: mtimeMs }
      }
    } catch {
      // Un .resx o .Designer.cs que no existe no cuenta.
    }
  }
  return masNueva
}

/** El .config que leería la app: el del propio ensamblado o, para una .dll, el único .exe.config. */
export async function configuracionDelBuild(ruta: string): Promise<string | null> {
  const propio = `${ruta}.config`
  if (await existe(propio)) {
    return propio
  }
  if (!/\.dll$/i.test(ruta)) {
    return null
  }
  const configs = (await listar(dirname(ruta))).filter(
    (e) => !e.carpeta && /\.exe\.config$/i.test(e.nombre)
  )
  const [unico] = configs
  return configs.length === 1 && unico ? join(dirname(ruta), unico.nombre) : null
}

/** Los .exe de la carpeta del build: la app que carga la .dll decide su arquitectura. */
export async function exesVecinos(ruta: string, maximo = 8): Promise<string[]> {
  return (await listar(dirname(ruta)))
    .filter((e) => !e.carpeta && /\.exe$/i.test(e.nombre))
    .slice(0, maximo)
    .map((e) => join(dirname(ruta), e.nombre))
}

export function dentroDe(raiz: string, ruta: string): boolean {
  const r = relative(raiz, ruta)
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}
