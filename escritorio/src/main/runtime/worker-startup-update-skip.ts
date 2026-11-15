import type { RuntimeTerminalWait } from '../../shared/runtime-types'
import type { DolphinRuntimeService } from './dolphin-runtime'
import { waitForWorkerAgentReady } from './terminal/wait/launched-agent-composer-readiness'

const UPDATE_SKIP_RECHECKS = 5
const UPDATE_SKIP_RECHECK_MS = 1_000

/**
 * Un worker de la orquestación arranca sin nadie mirando. Si el agente abre su aviso de versión
 * nueva («enter continue · esc skip»), Dolphin lo saltea con Esc y vuelve a esperar.
 * Why Esc y no Enter: en ese diálogo Enter elige «Update now» e instala. Cualquier otro diálogo
 * (carpeta, migración de modelo, hooks) sigue frenando el arranque, porque contestarlo es decidir
 * algo por la persona.
 */
export async function waitSkippingAgentUpdatePrompt(
  wait: () => Promise<RuntimeTerminalWait>,
  pressEscape: () => Promise<unknown>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms))
): Promise<RuntimeTerminalWait> {
  let result = await wait()
  if (result.satisfied || result.blockedReason !== 'agent-update-prompt') {
    return result
  }
  // Why una sola vez: en el compositor de Codex, Esc Esc abre la edición del mensaje anterior.
  await pressEscape()
  // Why volver a mirar: la espera lee la pantalla, y hasta que Codex se redibuja (unos cientos de
  // ms en Windows) el diálogo ya contestado sigue ahí y cuenta como bloqueo.
  for (let attempt = 0; attempt < UPDATE_SKIP_RECHECKS; attempt++) {
    await sleep(UPDATE_SKIP_RECHECK_MS)
    result = await wait()
    if (result.satisfied || result.blockedReason !== 'agent-update-prompt') {
      return result
    }
  }
  return result
}

/** `waitForWorkerAgentReady` con el aviso de versión nueva salteado. */
export function waitForWorkerAgentReadySkippingUpdate(
  runtime: DolphinRuntimeService,
  handle: string,
  args: Parameters<typeof waitForWorkerAgentReady>[2]
): Promise<RuntimeTerminalWait> {
  return waitSkippingAgentUpdatePrompt(
    () => waitForWorkerAgentReady(runtime, handle, args),
    () => runtime.sendTerminal(handle, { text: '\x1b' }, { inputKind: 'launch' })
  )
}
