import type { spawnProcess } from '@dolphin/process-host'
import { childProcessHasExited } from '@dolphin/process-host/process-tree-termination'
import type { DolphinFailureCode } from '../../shared/dolphin-console-types'
import { coreEntry } from './dolphin-core-entry'

/**
 * Lo que pasa mientras una consola de Dolphin arranca: con qué se lanza, leer dónde avisa que
 * escucha, esperar a que conteste su página con el pase, y explicar por qué no lo hizo. Lo usa
 * dolphin-console.ts.
 */

/** El proceso de una consola: lo que devuelve spawnProcess (este repo no importa child_process directo). */
type ChildProcess = ReturnType<typeof spawnProcess>

/** Con qué se lanza la consola de Dolphin en `dir`, o null si ahí no hay una (ver coreEntry). */
export function consoleEntry(dir: string): Promise<readonly string[] | null> {
  return coreEntry(dir, 'ui-cli')
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

/** Cuánto se espera un pedido a la consola: uno solo para todos. */
const REQUEST_TIMEOUT_MS = 15_000
/** Cuánto se espera cada «¿ya contestás?» mientras arranca. */
const PROBE_TIMEOUT_MS = 2_000

/** Un pedido a la consola, con tope: una consola colgada no cuelga a la app. */
export function askConsole(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms).unref())

/** La última línea que el proceso escribió por stderr: es lo que explica por qué se cayó. */
export function stderrTail(child: ChildProcess): () => string {
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
export function urlFromOutput(
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
    // Why: si el programa no se pudo lanzar (no existe, sin permiso) no hay 'exit', solo 'error';
    // sin esto se esperaba el tope entero para decir algo que ya se sabía.
    child.once('error', (error: Error) => {
      clearTimeout(timer)
      fail(new DolphinFailure('exited', error.message))
    })
  })
}

/** Espera a que la consola conteste con su página y devuelve el pase que trae. */
export async function waitUntilServing(
  url: string,
  child: ChildProcess,
  deadline: number,
  timeoutMs: number,
  lastError: () => string
): Promise<string> {
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
