import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSOLE_REQUEST_DEADLINE_MS, requestDolphinConsole } from './dolphin-console-request'

describe('requestDolphinConsole', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes on what the main process answered', async () => {
    await expect(
      requestDolphinConsole(async () => ({ ok: true, url: 'http://127.0.0.1:4700' }))
    ).resolves.toEqual({ ok: true, url: 'http://127.0.0.1:4700' })
    await expect(
      requestDolphinConsole(async () => ({ ok: false, code: 'not-built' }))
    ).resolves.toEqual({ ok: false, code: 'not-built' })
  })

  it('a request that never comes back ends in a timeout, not in «starting» forever', async () => {
    // Lo que colgaba la pantalla: un pedido al proceso principal que no vuelve nunca.
    const result = requestDolphinConsole(() => new Promise(() => undefined))
    await vi.advanceTimersByTimeAsync(CONSOLE_REQUEST_DEADLINE_MS)
    await expect(result).resolves.toEqual({
      ok: false,
      code: 'timeout',
      detail: String(CONSOLE_REQUEST_DEADLINE_MS / 1000)
    })
  })

  it('a request that breaks is reported with its reason', async () => {
    await expect(
      requestDolphinConsole(() => Promise.reject(new Error('No handler registered')))
    ).resolves.toEqual({ ok: false, code: 'unreachable', detail: 'No handler registered' })
    await expect(
      requestDolphinConsole(() => {
        throw new Error('window.api no está')
      })
    ).resolves.toEqual({ ok: false, code: 'unreachable', detail: 'window.api no está' })
  })

  it('an answer that arrives in time is not replaced by the timeout later', async () => {
    const result = requestDolphinConsole(
      () => new Promise((done) => setTimeout(() => done({ ok: true, url: 'http://x' }), 1_000))
    )
    await vi.advanceTimersByTimeAsync(CONSOLE_REQUEST_DEADLINE_MS * 2)
    await expect(result).resolves.toEqual({ ok: true, url: 'http://x' })
  })
})
