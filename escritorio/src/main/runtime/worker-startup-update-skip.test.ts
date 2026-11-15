import { describe, expect, it, vi } from 'vitest'
import type { RuntimeTerminalWait } from '../../shared/runtime-types'
import { waitSkippingAgentUpdatePrompt } from './worker-startup-update-skip'

const instant = async (): Promise<void> => undefined
const ready = { satisfied: true, status: 'idle' } as unknown as RuntimeTerminalWait
const blocked = (blockedReason: string): RuntimeTerminalWait =>
  ({ satisfied: false, status: 'blocked', blockedReason }) as unknown as RuntimeTerminalWait

describe('waitSkippingAgentUpdatePrompt', () => {
  it('no toca nada si el agente ya está listo', async () => {
    const pressEscape = vi.fn(async () => undefined)
    const wait = vi.fn(async () => ready)
    await expect(waitSkippingAgentUpdatePrompt(wait, pressEscape, instant)).resolves.toBe(ready)
    expect(pressEscape).not.toHaveBeenCalled()
    expect(wait).toHaveBeenCalledTimes(1)
  })

  it('saltea el aviso de versión nueva con Esc y espera de nuevo', async () => {
    const order: string[] = []
    const pressEscape = vi.fn(async () => void order.push('esc'))
    const wait = vi
      .fn<() => Promise<RuntimeTerminalWait>>()
      .mockImplementationOnce(async () => (order.push('wait'), blocked('agent-update-prompt')))
      .mockImplementationOnce(async () => (order.push('wait'), ready))
    await expect(waitSkippingAgentUpdatePrompt(wait, pressEscape, instant)).resolves.toBe(ready)
    expect(order).toEqual(['wait', 'esc', 'wait'])
  })

  it('después del Esc vuelve a mirar mientras la pantalla todavía muestra el diálogo', async () => {
    const pressEscape = vi.fn(async () => undefined)
    const wait = vi
      .fn<() => Promise<RuntimeTerminalWait>>()
      .mockResolvedValueOnce(blocked('agent-update-prompt'))
      .mockResolvedValueOnce(blocked('agent-update-prompt'))
      .mockResolvedValueOnce(blocked('agent-update-prompt'))
      .mockResolvedValueOnce(ready)
    await expect(waitSkippingAgentUpdatePrompt(wait, pressEscape, instant)).resolves.toBe(ready)
    expect(pressEscape).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledTimes(4)
  })

  it('aprieta Esc una sola vez: si el aviso sigue, el arranque queda frenado', async () => {
    const pressEscape = vi.fn(async () => undefined)
    const still = blocked('agent-update-prompt')
    const wait = vi.fn(async () => still)
    await expect(waitSkippingAgentUpdatePrompt(wait, pressEscape, instant)).resolves.toBe(still)
    expect(pressEscape).toHaveBeenCalledTimes(1)
    expect(wait).toHaveBeenCalledTimes(6)
  })

  it('cualquier otro diálogo no se contesta solo', async () => {
    const pressEscape = vi.fn(async () => undefined)
    const cwd = blocked('agent-cwd-prompt')
    await expect(
      waitSkippingAgentUpdatePrompt(async () => cwd, pressEscape, instant)
    ).resolves.toBe(cwd)
    expect(pressEscape).not.toHaveBeenCalled()
  })
})
