import { afterEach, describe, expect, it, vi } from 'vitest'

const initDaemonPtyProvider = vi.hoisted(() => vi.fn())
vi.mock('../daemon/providers/lifecycle/daemon-provider-init', () => ({ initDaemonPtyProvider }))

import { startDolphindDaemon } from './dolphind-daemon-supervision'
import { DolphindTerminalsNotDurableError } from './dolphind-serve-supervision'
import { resolveDolphindExitCode } from './dolphind-exit-code'
import {
  DOLPHIN_SERVE_SUPERVISED_ENV,
  DOLPHIND_EXIT_TERMINALS_NOT_DURABLE
} from '../../shared/serve-supervised-terminal-durability'

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env[DOLPHIN_SERVE_SUPERVISED_ENV]
})

describe('startDolphindDaemon', () => {
  it('refuses to serve a supervised host whose terminals would die with it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    initDaemonPtyProvider.mockRejectedValue(new Error('daemon health check rejected'))

    process.env[DOLPHIN_SERVE_SUPERVISED_ENV] = '1'
    const supervised = startDolphindDaemon('linux')
    await expect(supervised).rejects.toBeInstanceOf(DolphindTerminalsNotDurableError)
    const error = await supervised.catch((caught: unknown) => caught)
    expect(resolveDolphindExitCode(error)).toBe(DOLPHIND_EXIT_TERMINALS_NOT_DURABLE)
    expect(String(error)).toContain('daemon health check rejected')
    expect(process.env[DOLPHIN_SERVE_SUPERVISED_ENV]).toBeUndefined()

    await expect(startDolphindDaemon('linux')).resolves.toMatchObject({
      state: 'unavailable'
    })
  })
})
