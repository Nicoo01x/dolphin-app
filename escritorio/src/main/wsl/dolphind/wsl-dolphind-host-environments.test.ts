import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import {
  observeWslDolphindHostResponse,
  onWslDolphindHostAutomationsChanged,
  registerWslDolphindHostEnvironment,
  unregisterWslDolphindHostEnvironment,
  wslDolphindHostSupports
} from './wsl-dolphind-host-environments'

const CAPABILITY = 'agent-session.account-env.v1'

function status(capabilities: string[]): RuntimeRpcResponse<unknown> {
  return { id: 'status.get', ok: true, result: { capabilities }, _meta: { runtimeId: 'r' } }
}

describe('wslDolphindHostSupports', () => {
  afterEach(() => unregisterWslDolphindHostEnvironment('env-1', 'Ubuntu'))

  it('asks the host once, then answers from what it reported', async () => {
    registerWslDolphindHostEnvironment('env-1', 'Ubuntu')
    const readStatus = vi.fn(async () => status([CAPABILITY]))
    await expect(wslDolphindHostSupports('env-1', CAPABILITY, readStatus)).resolves.toBe(
      'supported'
    )
    await expect(wslDolphindHostSupports('env-1', CAPABILITY, readStatus)).resolves.toBe(
      'supported'
    )
    expect(readStatus).toHaveBeenCalledTimes(1)
  })

  it('reports an older host as unsupported and a failed probe as unknown', async () => {
    registerWslDolphindHostEnvironment('env-1', 'Ubuntu')
    await expect(
      wslDolphindHostSupports('env-1', CAPABILITY, async () => status([]))
    ).resolves.toBe('unsupported')
    registerWslDolphindHostEnvironment('env-1', 'Ubuntu')
    await expect(
      wslDolphindHostSupports('env-1', CAPABILITY, async () => {
        throw new Error('offline')
      })
    ).resolves.toBe('unknown')
    const failure: RuntimeRpcResponse<unknown> = {
      id: 'status.get',
      ok: false,
      error: { code: 'x', message: 'x' }
    }
    await expect(wslDolphindHostSupports('env-1', CAPABILITY, async () => failure)).resolves.toBe(
      'unknown'
    )
  })

  it("follows a renderer's status.get and forgets it on reconnect", async () => {
    registerWslDolphindHostEnvironment('env-1', 'Ubuntu')
    observeWslDolphindHostResponse('env-1', 'status.get', status([]))
    const readStatus = vi.fn(async () => status([CAPABILITY]))
    await expect(wslDolphindHostSupports('env-1', CAPABILITY, readStatus)).resolves.toBe(
      'unsupported'
    )
    observeWslDolphindHostResponse('env-1', 'terminal.list', status([CAPABILITY]))
    await expect(wslDolphindHostSupports('env-1', CAPABILITY, readStatus)).resolves.toBe(
      'unsupported'
    )
    // A reconnect may be a redeployed dolphind.
    registerWslDolphindHostEnvironment('env-1', 'Ubuntu')
    await expect(wslDolphindHostSupports('env-1', CAPABILITY, readStatus)).resolves.toBe(
      'supported'
    )
  })

  it('records nothing for an environment that is not a WSL dolphind', async () => {
    observeWslDolphindHostResponse('ssh-1', 'status.get', status([CAPABILITY]))
    await expect(
      wslDolphindHostSupports('ssh-1', CAPABILITY, async () => status([]))
    ).resolves.toBe('unknown')
  })
})

describe('onWslDolphindHostAutomationsChanged (E9)', () => {
  afterEach(() => unregisterWslDolphindHostEnvironment('env-1', 'Ubuntu'))

  it('tells the wake schedule when this desktop changed a WSL host’s automations', () => {
    registerWslDolphindHostEnvironment('env-1', 'Ubuntu')
    const listener = vi.fn()
    const stop = onWslDolphindHostAutomationsChanged(listener)
    const ok = (id: string): RuntimeRpcResponse<unknown> => ({
      id,
      ok: true,
      result: {},
      _meta: { runtimeId: 'r' }
    })
    observeWslDolphindHostResponse('env-1', 'automation.delete', ok('automation.delete'))
    observeWslDolphindHostResponse('env-1', 'automation.update', ok('automation.update'))
    observeWslDolphindHostResponse('env-1', 'automation.list', ok('automation.list'))
    observeWslDolphindHostResponse('ssh-box', 'automation.create', ok('automation.create'))
    expect(listener.mock.calls).toEqual([['env-1'], ['env-1']])
    stop()
  })
})
