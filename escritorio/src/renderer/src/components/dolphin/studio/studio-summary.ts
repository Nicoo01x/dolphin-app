import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import type { DolphinPortonRun } from '../../../../../shared/dolphin-console-types'

/**
 * Lo que hizo la sesión, de un vistazo: qué archivos tocó, cuántos comandos corrió y cuánto leyó.
 * Sale de las herramientas que el agente llamó, tal como las anotó en su conversación.
 */
export type StudioSessionSummary = {
  /** Rutas tal como las nombró el agente, sin repetir: la que tocó último, primero. */
  files: string[]
  fileActions?: Record<string, 'creado' | 'editado'>
  commands: number
  reads: number
}

const WRITES = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const RUNS = new Set(['Bash', 'PowerShell'])
const READS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'])

/** La ruta que nombra una herramienta que escribe. `input` llega como objeto o como su JSON. */
function pathOf(input: unknown): string | null {
  let value = input
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as Record<string, unknown>
  const path = record.file_path ?? record.notebook_path
  return typeof path === 'string' && path.trim() !== '' ? path : null
}

export function summarizeStudioSession(
  messages: readonly NativeChatMessage[]
): StudioSessionSummary {
  const touches: {
    path: string
    order: number
    action: 'creado' | 'editado'
    callId?: string
  }[] = []
  // Las escrituras que fallaron o se rechazaron no cambiaron nada (se aparean por callId).
  const failed = new Set<string>()
  let order = 0
  let commands = 0
  let reads = 0
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type === 'tool-call') {
        if (WRITES.has(block.name)) {
          const path = pathOf(block.input)
          if (path) {
            touches.push({
              path,
              order: order++,
              action: block.name === 'Write' ? 'creado' : 'editado',
              ...(block.callId ? { callId: block.callId } : {})
            })
          }
        } else if (RUNS.has(block.name)) {
          commands += 1
        } else if (READS.has(block.name)) {
          reads += 1
        }
      } else if (block.type === 'tool-result') {
        if (block.isError && block.callId) {
          failed.add(block.callId)
        } else if (block.editPatch?.filePath) {
          touches.push({ path: block.editPatch.filePath, order: order++, action: 'editado' })
        }
      }
    }
  }
  const lastTouch = new Map<string, number>()
  const fileActions: Record<string, 'creado' | 'editado'> = {}
  for (const touch of touches) {
    if (!touch.callId || !failed.has(touch.callId)) {
      lastTouch.set(touch.path, touch.order)
      fileActions[touch.path] = touch.action
    }
  }
  const files = [...lastTouch.entries()].sort((a, b) => b[1] - a[1]).map(([path]) => path)
  return { files, fileActions, commands, reads }
}

/**
 * Suma un resumen nuevo a lo que ya se había visto de la misma sesión. La vista lee una ventana de
 * los mensajes más nuevos: en una sesión larga, lo viejo sale de la ventana, y sin esto los
 * contadores bajaban y los archivos del principio desaparecían.
 */
export function mergeStudioSummaries(
  seen: StudioSessionSummary,
  latest: StudioSessionSummary
): StudioSessionSummary {
  const files = [...latest.files, ...seen.files.filter((path) => !latest.files.includes(path))]
  return {
    files,
    fileActions: { ...seen.fileActions, ...latest.fileActions },
    commands: Math.max(seen.commands, latest.commands),
    reads: Math.max(seen.reads, latest.reads)
  }
}

/** Lo que Claude Code anota de sus comandos locales (/clear, /model…): la lista no lo muestra. */
const LOCAL_COMMAND = /^\s*<(local-command-|command-name|command-message|command-args)/

/**
 * Si hay algo que mostrar. Una sesión recién limpiada con /clear tiene mensajes —los del comando—
 * y ninguno se ve: sin esto, el estudio quedaba en blanco en vez de decir dónde se habla.
 */
export function hasStudioConversation(messages: readonly NativeChatMessage[]): boolean {
  return messages.some((message) =>
    message.blocks.some(
      (block) =>
        block.type !== 'text' || (block.text.trim() !== '' && !LOCAL_COMMAND.test(block.text))
    )
  )
}

/** El nombre del archivo y la carpeta donde está, para mostrarlo corto con la ruta entera a mano. */
export function splitStudioPath(path: string): { name: string; folder: string } {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return { name: parts.at(-1) ?? path, folder: parts.slice(0, -1).join('/') }
}

/**
 * Cómo quedó una pasada del portón, en una palabra: es lo que pinta el color. «Pasó» se gana:
 * hace falta que haya terminado y que alguna fase haya corrido y pasado. Si todas se saltearon
 * (faltaba npm, por ejemplo) no corrió nada; y una pasada sin «hasta» se cortó a mitad.
 */
export type PortonVerdict = 'idle' | 'running' | 'passed' | 'failed' | 'skipped' | 'interrupted'

export function portonVerdict(
  run: DolphinPortonRun | null,
  running: boolean,
  interrupted = false
): PortonVerdict {
  if (running) {
    return 'running'
  }
  if (!run) {
    return interrupted ? 'interrupted' : 'idle'
  }
  if (run.fases.some((phase) => phase.estado === 'fallo')) {
    return 'failed'
  }
  if (interrupted || run.hasta === undefined) {
    return 'interrupted'
  }
  if (run.fases.length === 0) {
    return 'idle'
  }
  return run.fases.some((phase) => phase.estado === 'paso') ? 'passed' : 'skipped'
}

/** Por qué no corrió ninguna fase: lo que dijo la primera que se salteó. */
export function portonSkippedReason(run: DolphinPortonRun | null): string | null {
  return run?.fases.find((phase) => phase.estado === 'salteada')?.detalle ?? null
}

/** La fase que frenó la pasada, con la línea que explica por qué. */
export function portonFailure(
  run: DolphinPortonRun | null
): DolphinPortonRun['fases'][number] | null {
  return run?.fases.find((phase) => phase.estado === 'fallo') ?? null
}
