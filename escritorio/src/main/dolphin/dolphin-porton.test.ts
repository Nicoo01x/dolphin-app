import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  askConsole: vi.fn(),
  ensureConsole: vi.fn(),
  runningConsole: vi.fn(),
  failureOf: vi.fn((error: unknown) => ({
    ok: false as const,
    code: 'unreachable' as const,
    detail: error instanceof Error ? error.message : String(error)
  }))
}))

vi.mock('./dolphin-console', () => mocks)

import { startDolphinPorton } from './dolphin-porton'

function finishedPortonResponse(): Response {
  return new Response(JSON.stringify({ corriendo: false, pasada: null }), { status: 200 })
}

describe('startDolphinPorton revision body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ensureConsole.mockResolvedValue({ url: 'http://dolphin.test', token: 'token' })
    mocks.askConsole
      .mockResolvedValueOnce(new Response('{}', { status: 202 }))
      .mockResolvedValueOnce(finishedPortonResponse())
  })

  it('sends the review payload and truncates the task in main', async () => {
    await startDolphinPorton(
      '/repo',
      { appPath: '/app' },
      { tarea: 'x'.repeat(5_000), escribio: 'sonnet', base: 'origin/main' }
    )

    expect(JSON.parse(mocks.askConsole.mock.calls[0][1].body)).toEqual({
      tarea: 'x'.repeat(4_000),
      escribio: 'sonnet',
      base: 'origin/main'
    })
  })

  it('keeps the legacy empty body when no review is provided', async () => {
    await startDolphinPorton('/repo', { appPath: '/app' })

    expect(mocks.askConsole.mock.calls[0][1].body).toBe('{}')
  })
})
