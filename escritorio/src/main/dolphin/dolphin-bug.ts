import { app, ipcMain } from 'electron'
import { resolve } from 'node:path'
import { spawnProcess } from '@dolphin/process-host'
import { forceTerminateProcessTree } from '@dolphin/process-host/process-tree-termination'
import type { ChildProcessWithoutNullStreams as PipedChildProcess } from 'node:child_process'
import type { PipedProcessSpec } from '@dolphin/process-host/process-spec'
import { getTrustedUIRendererWebContents, isTrustedUIRenderer } from '../ipc/ui'
import type {
  DolphinBugAvance,
  DolphinBugFailureCode,
  DolphinBugRequest,
  DolphinBugTerminado
} from '../../shared/dolphin-bug-types'
import { resolveDolphinAppDir } from './dolphin-console'
import { coreEntry } from './dolphin-core-entry'

type Lanzar = (spec: PipedProcessSpec) => PipedChildProcess

export const DOLPHIN_BUG_TIMEOUT_MS = 30 * 60 * 1000
let reporteEnCurso: {
  child: PipedChildProcess
  timer: ReturnType<typeof setTimeout>
  terminate: (child: PipedChildProcess) => Promise<boolean>
} | null = null
/** Ya se pidió uno y se está buscando Dolphin en el disco: un segundo pedido no pasa. */
let reporteArrancando = false

export type DolphinBugLaunchOptions = {
  appPath: string
  dolphinDir?: string
  nodeProgram?: string
  env?: NodeJS.ProcessEnv
  spawn?: Lanzar
  terminate?: (child: PipedChildProcess) => Promise<boolean>
  onLine?: (avance: DolphinBugAvance) => void
  onFinished?: (terminado: DolphinBugTerminado) => void
}

/** `entry`: con qué se lanza el comando `dolphin` (ver coreEntry): fuente con tsx, o dist/. */
export function argumentosDolphinBug(
  request: Pick<DolphinBugRequest, 'repoPath' | 'que' | 'elemento'>,
  entry: readonly string[]
): readonly string[] {
  return [
    ...entry,
    'bug',
    // `--opción=valor`: lo que escribió la persona puede empezar con un guion, y suelto se
    // leería como otra opción.
    `--que=${request.que}`,
    `--elemento=${request.elemento}`,
    `--repo=${resolve(request.repoPath)}`,
    '--agente=claude'
  ]
}

function lineaFinalDe(buffer: string): string {
  return (
    buffer
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .findLast(Boolean) ?? ''
  )
}

function conectarSalida(
  stream: NodeJS.ReadableStream | null | undefined,
  id: string,
  emitir: (avance: DolphinBugAvance) => void,
  estado: { buffer: string; ultima: string }
): void {
  stream?.setEncoding('utf8')
  stream?.on('data', (chunk: string | Buffer) => {
    estado.buffer += String(chunk)
    const lineas = estado.buffer.split(/\r?\n/)
    estado.buffer = lineas.pop() ?? ''
    for (const linea of lineas) {
      const limpia = linea.trim()
      if (limpia) {
        estado.ultima = limpia
        emitir({ id, linea: limpia })
      }
    }
  })
  stream?.on('error', () => undefined)
}

/**
 * Dónde está Dolphin y con qué se lanza: un clon (src/ con tsx) o el núcleo construido que trae
 * la app instalada (resources/dolphin-app/dist). Why no solo src/: la app instalada no trae código
 * fuente ni tsx, y el reporte fallaba diciendo que Dolphin no estaba, con el núcleo ahí mismo.
 */
async function buscarDolphin(
  options: DolphinBugLaunchOptions,
  env: NodeJS.ProcessEnv
): Promise<{ dolphinDir: string; entry: readonly string[] }> {
  const dolphinDir = options.dolphinDir ?? (await resolveDolphinAppDir(options.appPath, env))
  const entry = await coreEntry(dolphinDir, 'dolphin')
  if (!entry) {
    throw new Error(`Dolphin no está en ${dolphinDir}`)
  }
  return { dolphinDir, entry }
}

export async function iniciarDolphinBug(
  request: DolphinBugRequest,
  options: DolphinBugLaunchOptions
): Promise<boolean> {
  if (reporteEnCurso || reporteArrancando) {
    return false
  }
  const env = options.env ?? process.env
  reporteArrancando = true
  let dolphinDir: string
  let entry: readonly string[]
  try {
    ;({ dolphinDir, entry } = await buscarDolphin(options, env))
  } finally {
    reporteArrancando = false
  }
  // Desde acá hasta que queda anotado en reporteEnCurso no hay ningún await: nadie se cuela.
  const emitir = options.onLine ?? (() => undefined)
  const terminar = options.onFinished ?? (() => undefined)
  const estado = { buffer: '', ultima: '' }
  let terminado = false
  const finalizar = (codigo: number): void => {
    if (terminado) {
      return
    }
    terminado = true
    if (child && reporteEnCurso?.child === child) {
      clearTimeout(reporteEnCurso.timer)
      reporteEnCurso = null
    }
    const ultima = lineaFinalDe(estado.buffer) || estado.ultima
    if (ultima && ultima !== estado.ultima) {
      emitir({ id: request.id, linea: ultima })
    }
    terminar({ id: request.id, codigo, lineaFinal: ultima })
  }
  let child: PipedChildProcess | undefined
  try {
    child = (options.spawn ?? spawnProcess)({
      program: options.nodeProgram ?? process.execPath,
      args: argumentosDolphinBug(request, entry),
      cwd: dolphinDir,
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'pipe',
      detached: process.platform !== 'win32',
      timeoutMs: DOLPHIN_BUG_TIMEOUT_MS,
      terminationBarrier: true
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    emitir({ id: request.id, linea: detail })
    finalizar(1)
    return true
  }
  const terminate = options.terminate ?? forceTerminateProcessTree
  const timer = setTimeout(() => {
    void terminate(child).then(
      () => finalizar(1),
      () => finalizar(1)
    )
  }, DOLPHIN_BUG_TIMEOUT_MS)
  timer.unref?.()
  reporteEnCurso = { child, timer, terminate }
  conectarSalida(child.stdout, request.id, emitir, estado)
  conectarSalida(child.stderr, request.id, emitir, estado)
  child.once('error', (error) => {
    emitir({ id: request.id, linea: error.message })
    finalizar(1)
  })
  child.once('exit', (codigo) => finalizar(codigo ?? 1))
  return true
}

export function detenerDolphinBug(): void {
  const actual = reporteEnCurso
  if (!actual) {
    return
  }
  reporteEnCurso = null
  clearTimeout(actual.timer)
  void actual.terminate(actual.child).catch(() => false)
}

function esPedidoDeBug(valor: unknown): valor is DolphinBugRequest {
  if (!valor || typeof valor !== 'object') {
    return false
  }
  const pedido = valor as Record<string, unknown>
  return ['id', 'repoPath', 'que', 'elemento'].every((campo) => typeof pedido[campo] === 'string')
}

export function registrarDolphinBug(): void {
  ipcMain.removeHandler('dolphin:xray:bug')
  ipcMain.handle('dolphin:xray:bug', async (event, valor: unknown) => {
    if (!isTrustedUIRenderer(event.sender) || !esPedidoDeBug(valor)) {
      return { ok: false as const, code: 'incomplete' as const }
    }
    const principal = getTrustedUIRendererWebContents()
    if (reporteEnCurso) {
      return { ok: false as const, code: 'already-running' as const }
    }
    try {
      const iniciado = await iniciarDolphinBug(valor, {
        appPath: app.getAppPath(),
        onLine: (avance) => {
          if (principal && !principal.isDestroyed()) {
            principal.send('ui:dolphinXrayBugAvance', avance)
          }
        },
        onFinished: (terminado) => {
          if (principal && !principal.isDestroyed()) {
            principal.send('ui:dolphinXrayBugTerminado', terminado)
          }
        }
      })
      if (!iniciado) {
        return { ok: false as const, code: 'already-running' as const }
      }
      return { ok: true as const, id: valor.id }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      const missing = detail.startsWith('Dolphin no está en ')
      const fallo: { code: DolphinBugFailureCode; detail?: string } = missing
        ? { code: 'dolphin-missing', detail: detail.slice('Dolphin no está en '.length) }
        : { code: 'unknown', detail }
      const terminado: DolphinBugTerminado = {
        id: valor.id,
        codigo: 1,
        lineaFinal: '',
        fallo
      }
      if (principal && !principal.isDestroyed()) {
        principal.send('ui:dolphinXrayBugTerminado', terminado)
      }
      return { ok: false as const, code: fallo.code, detail: fallo.detail }
    }
  })
  app.once('will-quit', detenerDolphinBug)
}
