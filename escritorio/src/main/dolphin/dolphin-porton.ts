import { z } from 'zod'
import {
  DolphinPortonRunSchema,
  type DolphinPortonResult,
  type DolphinPortonRevision
} from '../../shared/dolphin-console-types'
import {
  askConsole,
  ensureConsole,
  failureOf,
  runningConsole,
  type OpenOptions,
  type RunningConsole
} from './dolphin-console'

/**
 * El portón a mano del estudio de Claude: la consola de Dolphin de la carpeta corre sus fases (las
 * del package.json, sin las que construyen) y se le pregunta cómo va. Si ya hay una pasada
 * corriendo no arranca otra: se contesta la que corre. Va desde acá por lo mismo que el modo live:
 * la consola no contesta CORS y solo acepta pedidos con Host local y su pase.
 */

/** Lo que contesta `/api/porton`, validado: es la respuesta de otro proceso. */
const PortonStateSchema = z.object({
  corriendo: z.boolean(),
  pasada: DolphinPortonRunSchema.nullable()
})

async function readPortonFrom(running: RunningConsole): Promise<DolphinPortonResult> {
  const response = await askConsole(`${running.url}/api/porton`)
  const parsed = PortonStateSchema.safeParse(await response.json().catch(() => null))
  if (!response.ok || !parsed.success) {
    return { ok: false, code: 'rejected', detail: String(response.status) }
  }
  return { ok: true, ...parsed.data }
}

export async function startDolphinPorton(
  repoPath: string,
  options: OpenOptions,
  revision?: DolphinPortonRevision
): Promise<DolphinPortonResult> {
  let running: RunningConsole
  try {
    running = await ensureConsole(repoPath, options)
  } catch (error) {
    return failureOf(error)
  }
  try {
    const body = revision
      ? JSON.stringify({
          tarea: revision.tarea.slice(0, 4_000),
          ...(revision.escribio ? { escribio: revision.escribio } : {}),
          ...(revision.base ? { base: revision.base } : {})
        })
      : '{}'
    const response = await askConsole(`${running.url}/api/porton`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dolphin-token': running.token },
      body
    })
    if (response.status !== 202 && response.status !== 409) {
      const body = (await response.json().catch(() => null)) as { porQue?: unknown } | null
      return {
        ok: false,
        code: 'rejected',
        detail: typeof body?.porQue === 'string' ? body.porQue : String(response.status)
      }
    }
    return await readPortonFrom(running)
  } catch (error) {
    return failureOf(error)
  }
}

/**
 * Cómo va el portón a mano de la carpeta. Pregunta a la consola que ya corre y no levanta otra: una
 * consola nueva contestaría «ninguna pasada» y la que se cortó desaparecería sin explicación.
 */
export async function readDolphinPorton(
  repoPath: string,
  _options?: OpenOptions
): Promise<DolphinPortonResult> {
  try {
    const running = await runningConsole(repoPath)
    if (!running) {
      return { ok: false, code: 'unreachable', detail: 'la consola de Dolphin no está corriendo' }
    }
    return await readPortonFrom(running)
  } catch (error) {
    return failureOf(error)
  }
}
