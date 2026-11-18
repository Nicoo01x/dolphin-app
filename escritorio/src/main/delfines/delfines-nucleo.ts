import { runProcess } from '@dolphin/process-host'
import type { ProcessResult, ProcessSpec } from '@dolphin/process-host/process-spec'
import { resolveDolphinAppDir } from '../dolphin/dolphin-console'
import { coreEntry } from '../dolphin/dolphin-core-entry'

/**
 * `dolphin bots …` en esta computadora, con el núcleo que trae la app. Es el mismo camino que la
 * consola y el reporte de X-ray: `coreEntry` decide con qué se lanza (el clon con tsx o el dist/
 * del instalador) y corre con el Electron de la app como Node, así no hace falta Node instalado.
 */

/** Hablarle a un bot es una corrida entera del motor: puede tardar varios minutos. */
export const ESPERA_DE_CHARLA_MS = 10 * 60 * 1000
export const ESPERA_CORTA_MS = 60 * 1000

export class FalloDelNucleo extends Error {
  constructor(
    readonly code: 'sin-nucleo' | 'nucleo',
    detail: string
  ) {
    super(detail)
  }
}

export type NucleoLocal = {
  /** Dónde está el núcleo: la app lo copia de ahí cuando lo lleva a un servidor. */
  carpeta: () => Promise<string>
  json: <T>(
    args: readonly string[],
    opciones?: { entrada?: string; esperaMs?: number }
  ) => Promise<T>
}

export type OpcionesDelNucleo = {
  appPath: string
  env?: NodeJS.ProcessEnv
  nodeProgram?: string
  correr?: (spec: ProcessSpec) => Promise<ProcessResult>
  /** Para los tests: dónde está el núcleo y con qué se lanza, sin buscarlo en el disco. */
  ubicar?: () => Promise<{ dir: string; entry: readonly string[] | null }>
}

/**
 * El mensaje de un error del núcleo, sin el stack de Node: la última línea que dice `Error: …`, o
 * la última que haya. El CLI tira el `throw` crudo y Node imprime doce líneas encima.
 */
export function motivoDelNucleo(stderr: string, stdout = ''): string {
  const lineas = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean)
  const error = lineas.find((linea) => /^(?:\w*Error|error):/.test(linea))
  if (error) {
    return error.replace(/^\w*Error:\s*/, '').replace(/^error:\s*/, '')
  }
  return lineas.findLast((linea) => !linea.startsWith('at ')) ?? 'el núcleo no contestó'
}

/** La última línea de la salida que es JSON: lo demás (avisos de Node) no cuenta. */
export function jsonDeLaSalida<T>(stdout: string): T {
  const linea = stdout
    .split(/\r?\n/)
    .map((x) => x.trim())
    .findLast((x) => x.startsWith('{') || x.startsWith('['))
  if (!linea) {
    throw new FalloDelNucleo('nucleo', 'el núcleo no devolvió JSON')
  }
  return JSON.parse(linea) as T
}

export function nucleoLocal(opciones: OpcionesDelNucleo): NucleoLocal {
  const env = opciones.env ?? process.env
  const ubicar =
    opciones.ubicar ??
    (async () => {
      const dir = await resolveDolphinAppDir(opciones.appPath, env)
      return { dir, entry: await coreEntry(dir, 'dolphin') }
    })
  const correr = opciones.correr ?? ((spec: ProcessSpec) => runProcess(spec, 'tail'))
  return {
    carpeta: async () => (await ubicar()).dir,
    json: async <T>(
      args: readonly string[],
      { entrada, esperaMs = ESPERA_CORTA_MS }: { entrada?: string; esperaMs?: number } = {}
    ): Promise<T> => {
      const { dir, entry } = await ubicar()
      if (!entry) {
        throw new FalloDelNucleo('sin-nucleo', dir)
      }
      const resultado = await correr({
        program: opciones.nodeProgram ?? process.execPath,
        args: [...entry, 'bots', ...args, '--json'],
        cwd: dir,
        env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
        timeoutMs: esperaMs,
        ...(entrada !== undefined ? { input: entrada } : {})
      })
      if (resultado.timedOut) {
        throw new FalloDelNucleo('nucleo', 'el núcleo tardó demasiado en contestar')
      }
      if (resultado.code !== 0) {
        throw new FalloDelNucleo('nucleo', motivoDelNucleo(resultado.stderr, resultado.stdout))
      }
      return jsonDeLaSalida<T>(resultado.stdout)
    }
  }
}
