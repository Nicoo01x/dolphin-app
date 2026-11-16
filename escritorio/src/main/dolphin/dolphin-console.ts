import { leerEnvDolphin } from '../../shared/dolphin-env'
import { basename, join, resolve } from 'node:path'
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
import {
  askConsole,
  consoleEntry,
  DolphinFailure,
  sleep,
  stderrTail,
  urlFromOutput,
  waitUntilServing
} from './dolphin-console-arranque'

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
export { askConsole, DolphinFailure, tokenFromConsolePage } from './dolphin-console-arranque'

/** El proceso de una consola: lo que devuelve spawnProcess (este repo no importa child_process directo). */
type ChildProcess = ReturnType<typeof spawnProcess>

export type RunningConsole = {
  url: string
  child: ChildProcess
  /** El pase de la consola: viene en su página y lo piden sus POST. */
  token: string
}

export type OpenOptions = {
  /** La carpeta de la app (app.getAppPath()): Dolphin se busca al lado, salvo DOLPHIN_APP_DIR. */
  appPath: string
  /** Con qué se corre Node: por defecto, el mismo Electron como Node (no depende del PATH). */
  nodeProgram?: string
  env?: NodeJS.ProcessEnv
  /** Cuánto puede tardar en arrancar, de punta a punta: decir dónde escucha y contestar su página. */
  timeoutMs?: number
}

/**
 * Lo que puede tardar una consola en arrancar, si no se dice otra cosa. Why 45 s: en frío, con la
 * máquina cargada, se midió un arranque de 38 s (ver dolphin-tablero-mover.ts).
 */
const START_TIMEOUT_MS = 45_000
/**
 * El margen por encima del arranque para todo lo demás: buscar Dolphin en el disco, esperar a otro
 * pedido que ya la estaba levantando. Why un tope sobre todo y no solo sobre el proceso: con el
 * disco ocupado, mirar si existe un archivo puede tardar lo que quiera, y la pantalla se quedaba
 * en «Levantando la consola…» sin error ni Reintentar.
 */
const OPEN_MARGIN_MS = 5_000

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

/**
 * La app instalada (corre desde su app.asar) sin DOLPHIN_APP_DIR: Dolphin se busca en su carpeta
 * resources, y el instalador no lo trae.
 */
function installedWithoutCore(appPath: string, env: NodeJS.ProcessEnv): boolean {
  return basename(appPath).toLowerCase().endsWith('.asar') && !leerEnvDolphin('APP_DIR', env)
}

/**
 * La consola del repo, con tope de punta a punta: pase lo que pase en el medio, contesta.
 * Why no se corta el arranque al vencer: si la consola termina de levantar, queda para el próximo
 * pedido (Reintentar la encuentra ya lista).
 */
export function ensureConsoleInTime(repo: string, options: OpenOptions): Promise<RunningConsole> {
  const limitMs = (options.timeoutMs ?? START_TIMEOUT_MS) + OPEN_MARGIN_MS
  return new Promise((done, fail) => {
    const timer = setTimeout(
      () => fail(new DolphinFailure('timeout', String(Math.round(limitMs / 1000)))),
      limitMs
    )
    ensureConsole(repo, options).then(
      (running) => {
        clearTimeout(timer)
        done(running)
      },
      (error: unknown) => {
        clearTimeout(timer)
        fail(error)
      }
    )
  })
}

/** Clave del repo: en Windows las rutas no distinguen mayúsculas. */
function keyOf(repo: string): string {
  const absolute = resolve(repo)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

async function startConsole(
  repo: string,
  dir: string,
  entry: readonly string[],
  options: OpenOptions
): Promise<RunningConsole> {
  const env = options.env ?? process.env
  const child = spawnProcess({
    program: options.nodeProgram ?? process.execPath,
    // Why --puerto 0: el puerto lo elige el sistema cuando la consola escucha, y ella avisa cuál.
    // Elegir uno libre acá y pasárselo dejaba un hueco en el que otro proceso se lo llevaba, y
    // entonces contestaba otro servidor en su lugar.
    args: [...entry, '--repo', resolve(repo), '--puerto', '0'],
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
  const timeoutMs = options.timeoutMs ?? START_TIMEOUT_MS
  // Why un solo presupuesto: con un tope por paso, dos pasos lentos sumaban el doble de lo dicho.
  const deadline = Date.now() + timeoutMs
  try {
    const url = await urlFromOutput(child, timeoutMs, lastError)
    const token = await waitUntilServing(url, child, deadline, timeoutMs, lastError)
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

  const env = options.env ?? process.env
  const dir = await resolveDolphinAppDir(options.appPath, env)
  const entry = await consoleEntry(dir)
  if (!entry) {
    // Why otro código: la app instalada no trae el núcleo, y «corré npm install en la carpeta
    // resources de la app» no es algo que nadie pueda hacer.
    throw new DolphinFailure(
      installedWithoutCore(options.appPath, env) ? 'not-installed' : 'not-found',
      dir
    )
  }
  // Why volver a mirar: mientras se buscaba Dolphin en el disco, otro pedido pudo haberla arrancado.
  if (consoles.has(key)) {
    return ensureConsole(repo, options)
  }
  const starting = startConsole(repo, dir, entry, options)
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
    return { ok: true, url: (await ensureConsoleInTime(repo, options)).url }
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
    running = await ensureConsoleInTime(request.repoPath, options)
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
