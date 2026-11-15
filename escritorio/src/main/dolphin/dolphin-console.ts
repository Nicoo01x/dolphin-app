import { leerEnvDolphin } from '../../shared/dolphin-env'
import { join, resolve } from 'node:path'
import { rutaExiste } from './ruta-existe'
import { spawnProcess } from '@dolphin/process-host'
import {
  childProcessHasExited,
  forceTerminateProcessTree
} from '@dolphin/process-host/process-tree-termination'
import type {
  DolphinConsoleResult,
  DolphinFailureCode,
  DolphinLiveRequest,
  DolphinLiveResult
} from '../../shared/dolphin-console-types'

/**
 * La consola de Dolphin adentro de la app de escritorio.
 *
 * Dolphin —siembras, portón, cosechas, Memoria, Mission Control— vive en su propio repo
 * (dolphin-app) y sirve su consola web con un proceso Node. Este módulo la levanta para el
 * repo que se le pide, una por repo y reusada mientras viva, y devuelve su URL para que el
 * renderer la muestre. Al salir de la app se cierran todas, con lo que hayan lanzado.
 *
 * Why una por repo y no una sola con `?p=`: la consola cambia de proyecto solo entre los de la
 * lista de la persona, y para eso habría que sumarle cada worktree donde se usa el modo live; la
 * lista terminaría llena de worktrees borrados. Lo que costaba tener varias —que cada una
 * corriera la agenda de todos los proyectos— lo resuelve Dolphin con un reloj por repo.
 */

export type { DolphinConsoleResult }

/** El proceso de una consola: lo que devuelve spawnProcess (este repo no importa child_process directo). */
type ChildProcess = ReturnType<typeof spawnProcess>

export type RunningConsole = {
  url: string
  child: ChildProcess
  /** El pase de la consola: viene en su página y lo piden sus POST. */
  token: string
}

/** Una falla con su código, para el renderer, y el detalle tal cual. */
export class DolphinFailure extends Error {
  constructor(
    readonly code: DolphinFailureCode,
    readonly detail?: string
  ) {
    super(detail ?? code)
  }
}

/** El pase que la consola de Dolphin pone en su página (`<meta name="dolphin-token">`). */
export function tokenFromConsolePage(html: string): string | undefined {
  return /<meta name="dolphin-token" content="([0-9a-f]+)"/.exec(html)?.[1]
}

export type OpenOptions = {
  /** La carpeta de la app (app.getAppPath()): Dolphin se busca al lado, salvo DOLPHIN_APP_DIR. */
  appPath: string
  /** Con qué se corre Node: por defecto, el mismo Electron como Node (no depende del PATH). */
  nodeProgram?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

/** Cuánto se espera un pedido a la consola: uno solo para todos. */
const REQUEST_TIMEOUT_MS = 15_000
/** Cuánto se espera cada «¿ya contestás?» mientras arranca. */
const PROBE_TIMEOUT_MS = 2_000

const consoles = new Map<string, Promise<RunningConsole>>()
/** Los procesos de consola vivos, también los que todavía arrancan: al salir no queda ninguno. */
const children = new Set<ChildProcess>()

/**
 * Dónde está Dolphin: DOLPHIN_APP_DIR; si no, la carpeta de arriba cuando el escritorio vive
 * adentro del repo del núcleo (`dolphin-app/escritorio`, desde el 26/10); si no, al lado.
 */
export async function resolveDolphinAppDir(
  appPath: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  const appDir = leerEnvDolphin('APP_DIR', env)
  if (appDir) {
    return resolve(appDir)
  }
  const arriba = resolve(appPath, '..')
  return (await rutaExiste(join(arriba, 'dolphin.config.json')))
    ? arriba
    : resolve(arriba, 'dolphin-app')
}

/** Un pedido a la consola, con tope: una consola colgada no cuelga a la app. */
export function askConsole(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms).unref())

/** La última línea que el proceso escribió por stderr: es lo que explica por qué se cayó. */
function stderrTail(child: ChildProcess): () => string {
  let tail = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    tail = (tail + chunk).slice(-2_000)
  })
  child.stderr?.on('error', () => undefined)
  return () =>
    tail
      .split(/\r?\n/)
      .map((line) => line.trim())
      .findLast((line) => line !== '') ?? ''
}

/** Detalle: el código de salida (o la señal) y, si escribió algo, su última línea de error. */
function exitedFailure(child: ChildProcess, lastError: string): DolphinFailure {
  const how = String(child.signalCode ?? child.exitCode)
  return new DolphinFailure('exited', lastError ? `${how} · ${lastError}` : how)
}

/**
 * La URL que la consola avisa por su salida al arrancar («http://127.0.0.1:PUERTO»). Después la
 * salida se sigue leyendo y se descarta: un pipe que nadie vacía frena al proceso cuando se llena.
 */
function urlFromOutput(
  child: ChildProcess,
  timeoutMs: number,
  lastError: () => string
): Promise<string> {
  return new Promise((done, fail) => {
    let seen = ''
    const timer = setTimeout(
      () => fail(new DolphinFailure('timeout', String(Math.round(timeoutMs / 1000)))),
      timeoutMs
    )
    const onData = (chunk: Buffer | string): void => {
      seen = (seen + String(chunk)).slice(-4_000)
      const match = /http:\/\/127\.0\.0\.1:([1-9]\d*)/.exec(seen)
      if (!match) {
        return
      }
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.stdout?.resume()
      done(match[0])
    }
    child.stdout?.on('data', onData)
    // Why: sin este listener, un error del pipe tira el proceso principal entero.
    child.stdout?.on('error', () => undefined)
    child.once('exit', () => {
      clearTimeout(timer)
      fail(exitedFailure(child, lastError()))
    })
  })
}

/** Espera a que la consola conteste con su página y devuelve el pase que trae. */
async function waitUntilServing(
  url: string,
  child: ChildProcess,
  timeoutMs: number,
  lastError: () => string
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (childProcessHasExited(child)) {
      throw exitedFailure(child, lastError())
    }
    let response: Response | undefined
    try {
      response = await askConsole(url, {}, PROBE_TIMEOUT_MS)
    } catch {
      // Todavía no escucha: se vuelve a preguntar.
    }
    // Why: sin construir, la consola contesta 503 enseguida y para siempre; esperar no lo arregla.
    if (response?.status === 503) {
      throw new DolphinFailure('not-built')
    }
    if (response?.ok) {
      const token = tokenFromConsolePage(await response.text())
      if (token) {
        return token
      }
      // Why: sin el pase en la página es un Dolphin de antes del pase: construirlo de nuevo lo trae.
      throw new DolphinFailure('not-built')
    }
    await sleep(200)
  }
  throw new DolphinFailure('timeout', String(Math.round(timeoutMs / 1000)))
}

/** Clave del repo: en Windows las rutas no distinguen mayúsculas. */
function keyOf(repo: string): string {
  const absolute = resolve(repo)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

async function startConsole(
  repo: string,
  dir: string,
  options: OpenOptions
): Promise<RunningConsole> {
  const env = options.env ?? process.env
  const child = spawnProcess({
    program: options.nodeProgram ?? process.execPath,
    // Why --import y no el cli de tsx: el cli lanza otro proceso, y en Windows matar al hijo deja
    // al nieto escuchando. Así es uno solo (como lanza Dolphin sus propios procesos).
    // Why --puerto 0: el puerto lo elige el sistema cuando la consola escucha, y ella avisa cuál.
    // Elegir uno libre acá y pasárselo dejaba un hueco en el que otro proceso se lo llevaba, y
    // entonces contestaba otro servidor en su lugar.
    args: [
      '--import',
      'tsx',
      join(dir, 'src', 'ui-cli.ts'),
      '--repo',
      resolve(repo),
      '--puerto',
      '0'
    ],
    cwd: dir,
    // Why: con el Electron de la app como Node no hace falta un Node en el PATH. Dolphin se saca
    // la variable al arrancar y solo se la pasa a sus propios procesos (dolphin-app,
    // nucleo/electron.ts): ni los agentes ni las fases del portón la heredan.
    env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    // Why: en POSIX, cabeza de su propio grupo, para que al cerrar caiga el árbol entero.
    detached: process.platform !== 'win32',
    timeoutMs: null
  })
  children.add(child)
  child.once('exit', () => children.delete(child))
  child.once('error', () => undefined)
  const lastError = stderrTail(child)
  const timeoutMs = options.timeoutMs ?? 20_000
  try {
    const url = await urlFromOutput(child, timeoutMs, lastError)
    const token = await waitUntilServing(url, child, timeoutMs, lastError)
    return { url, child, token }
  } catch (error) {
    void forceTerminateProcessTree(child).catch(() => false)
    throw error
  }
}

/** La consola del repo si ya corre, sin levantar ninguna: preguntar no es pedir. */
export async function runningConsole(repo: string): Promise<RunningConsole | null> {
  const running = await consoles.get(keyOf(repo))?.catch(() => undefined)
  return running && !childProcessHasExited(running.child) ? running : null
}

/** La consola del repo: la que ya corre, o una nueva si no hay o si la que había murió. */
export async function ensureConsole(repo: string, options: OpenOptions): Promise<RunningConsole> {
  const key = keyOf(repo)
  const existing = consoles.get(key)
  if (existing) {
    const running = await existing.catch(() => undefined)
    // Why también la señal: una consola que mató el sistema tiene exitCode null y signalCode puesto.
    if (running && !childProcessHasExited(running.child)) {
      return running
    }
    if (consoles.get(key) === existing) {
      consoles.delete(key)
    }
  }

  const dir = await resolveDolphinAppDir(options.appPath, options.env ?? process.env)
  if (
    !(await rutaExiste(join(dir, 'src', 'ui-cli.ts'))) ||
    !(await rutaExiste(join(dir, 'node_modules', 'tsx', 'package.json')))
  ) {
    throw new DolphinFailure('not-found', dir)
  }
  // Why volver a mirar: mientras se buscaba Dolphin en el disco, otro pedido pudo haberla arrancado.
  if (consoles.has(key)) {
    return ensureConsole(repo, options)
  }
  const starting = startConsole(repo, dir, options)
  consoles.set(key, starting)
  const forget = (): void => {
    if (consoles.get(key) === starting) {
      consoles.delete(key)
    }
  }
  starting.then((running) => running.child.once('exit', forget), forget)
  return starting
}

export function failureOf(error: unknown): {
  ok: false
  code: DolphinFailureCode
  detail?: string
} {
  if (error instanceof DolphinFailure) {
    return { ok: false, code: error.code, ...(error.detail ? { detail: error.detail } : {}) }
  }
  return {
    ok: false,
    code: 'unreachable',
    detail: error instanceof Error ? error.message : String(error)
  }
}

export async function openDolphinConsole(
  repo: string,
  options: OpenOptions
): Promise<DolphinConsoleResult> {
  try {
    return { ok: true, url: (await ensureConsole(repo, options)).url }
  } catch (error) {
    return failureOf(error)
  }
}

/**
 * El modo live: el elemento que se tocó en el navegador de la app y lo que se pidió, a la
 * consola de Dolphin del repo, que siembra una rama con ese contexto. Va desde acá y no desde
 * el renderer: la consola no contesta CORS y solo acepta pedidos con Host local y su pase.
 */
export async function sendDolphinLive(
  request: DolphinLiveRequest,
  options: OpenOptions
): Promise<DolphinLiveResult> {
  let running: RunningConsole
  try {
    running = await ensureConsole(request.repoPath, options)
  } catch (error) {
    return failureOf(error)
  }
  try {
    const response = await askConsole(`${running.url}/api/live`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dolphin-token': running.token },
      body: JSON.stringify({ pedido: request.pedido, elemento: request.elemento })
    })
    if (response.status === 202) {
      return { ok: true, url: running.url }
    }
    const body = (await response.json().catch(() => null)) as { porQue?: unknown } | null
    return {
      ok: false,
      code: 'rejected',
      detail: typeof body?.porQue === 'string' ? body.porQue : String(response.status)
    }
  } catch (error) {
    return failureOf(error)
  }
}

/**
 * Al salir de la app: no quedan consolas de Dolphin escuchando, ni lo que lanzaron —siembras,
 * agentes, las fases del portón—, ni una que todavía estaba arrancando. Resuelve cuando salieron
 * todas, o a los 3 s: un cierre no se cuelga acá.
 */
export async function closeDolphinConsoles(): Promise<void> {
  const alive = [...children]
  consoles.clear()
  children.clear()
  const stopped = alive.map(async (child) => {
    if (childProcessHasExited(child)) {
      return
    }
    const exited = new Promise<void>((done) => child.once('exit', () => done()))
    await forceTerminateProcessTree(child).catch(() => false)
    // Why esperar la salida: en Windows la carpeta donde corre un proceso no se puede borrar hasta
    // que termina, y la app no tiene que irse con una consola todavía escuchando.
    await exited
  })
  await Promise.race([Promise.all(stopped), sleep(3_000)])
}
