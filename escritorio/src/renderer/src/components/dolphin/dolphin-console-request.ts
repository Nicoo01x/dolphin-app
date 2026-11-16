import type { DolphinConsoleResult } from '../../../../shared/dolphin-console-types'

/**
 * Cuánto espera la pantalla al proceso principal. Por encima de su propio tope (45 s de arranque
 * más 5 de margen): lo normal es que conteste él, con su motivo; esto es para cuando no contesta.
 */
export const CONSOLE_REQUEST_DEADLINE_MS = 60_000

/**
 * Pide la consola y siempre termina en una respuesta: la del proceso principal, o un fallo si el
 * pedido se rompe o no vuelve a tiempo. Why: un pedido que no volvía dejaba la pantalla en
 * «Levantando la consola de Dolphin…» para siempre, sin error ni Reintentar.
 */
export function requestDolphinConsole(
  open: () => Promise<DolphinConsoleResult>,
  deadlineMs = CONSOLE_REQUEST_DEADLINE_MS
): Promise<DolphinConsoleResult> {
  return new Promise((done) => {
    const timer = setTimeout(
      () => done({ ok: false, code: 'timeout', detail: String(Math.round(deadlineMs / 1000)) }),
      deadlineMs
    )
    const settle = (result: DolphinConsoleResult): void => {
      clearTimeout(timer)
      done(result)
    }
    let pending: Promise<DolphinConsoleResult>
    try {
      pending = open()
    } catch (error) {
      settle(unreachable(error))
      return
    }
    pending.then(settle, (error: unknown) => settle(unreachable(error)))
  })
}

function unreachable(error: unknown): DolphinConsoleResult {
  return {
    ok: false,
    code: 'unreachable',
    detail: error instanceof Error ? error.message : String(error)
  }
}
