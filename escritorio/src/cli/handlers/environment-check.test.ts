import { afterEach, describe, expect, it, vi } from 'vitest'

const { networkInterfacesMock, remoteCallMock, remoteClientMock } = vi.hoisted(() => ({
  networkInterfacesMock: vi.fn(),
  remoteCallMock: vi.fn(),
  remoteClientMock: vi.fn()
}))

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  networkInterfaces: networkInterfacesMock
}))

vi.mock('../runtime-client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDefaultUserDataPath: () => '/tmp/dolphin-user-data',
  RuntimeClient: class {
    constructor(...args: unknown[]) {
      remoteClientMock(...args)
    }
    call = remoteCallMock
  }
}))

vi.mock('../runtime/environments', () => ({
  resolveEnvironment: () => ({
    id: 'env-1',
    name: 'VPS-OpenClaw',
    createdAt: 1,
    endpoints: [
      {
        id: 'ws-1',
        kind: 'websocket',
        label: 'WebSocket',
        endpoint: 'ws://100.104.98.122:6768',
        deviceToken: 'token',
        publicKeyB64: 'key'
      }
    ],
    preferredEndpointId: 'ws-1'
  })
}))

import { RuntimeClientError } from '../runtime-client'
import {
  checkEnvironment,
  ENVIRONMENT_CHECK_HANDLERS,
  formatEnvironmentCheck
} from './environment-check'

const TAILSCALE_OFF = {
  Tailscale: [{ address: 'fe80::1' }],
  Ethernet: [{ address: '192.168.0.2' }]
}

afterEach(() => {
  process.exitCode = undefined
  vi.restoreAllMocks()
})

describe('dolphin environment check', () => {
  it('dice que Tailscale está apagado cuando no llega y no hay tailnet local', async () => {
    networkInterfacesMock.mockReturnValue(TAILSCALE_OFF)
    const result = await checkEnvironment('VPS-OpenClaw', () =>
      Promise.reject(
        new RuntimeClientError(
          'remote_runtime_unavailable',
          'Could not connect to the remote Dolphin runtime.'
        )
      )
    )
    expect(result).toMatchObject({
      reason: 'tailscale-off',
      localTailnet: 'down',
      environment: { name: 'VPS-OpenClaw', endpoint: 'ws://100.104.98.122:6768' },
      error: { code: 'remote_runtime_unavailable' }
    })
    expect(formatEnvironmentCheck(result)).toContain('✗ Tailscale está apagado en esta máquina')
  })

  it('dice que no es Dolphin cuando contesta el servidor de la base', async () => {
    networkInterfacesMock.mockReturnValue({ Tailscale: [{ address: '100.88.1.2' }] })
    const result = await checkEnvironment('VPS-OpenClaw', async () => ({
      result: { capabilities: ['orcad.terminal-census.v1'], appVersion: '1.4.229' } as never
    }))
    expect(result).toMatchObject({
      reason: 'not-dolphin',
      product: 'base',
      serverVersion: '1.4.229'
    })
    expect(formatEnvironmentCheck(result)).toContain('! Ese servidor no es Dolphin')
  })

  it('sale con 1 salvo cuando está conectado a un Dolphin', async () => {
    networkInterfacesMock.mockReturnValue({ Tailscale: [{ address: '100.88.1.2' }] })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = ENVIRONMENT_CHECK_HANDLERS['environment check']
    const flags = new Map<string, string | boolean>([['environment', 'VPS-OpenClaw']])
    // The dispatcher's client talks to this machine's Dolphin; the check must dial the server.
    const localCall = vi.fn()
    remoteCallMock.mockResolvedValue({
      result: { capabilities: ['dolphind.peer-desktops.v1'], appVersion: '1.7.0' }
    })
    await handler({ client: { call: localCall }, flags, json: true } as never)
    expect(localCall).not.toHaveBeenCalled()
    expect(remoteClientMock).toHaveBeenCalledWith('/tmp/dolphin-user-data', 20_000, null, 'env-1')
    expect(remoteCallMock).toHaveBeenCalledWith('status.get')
    expect(process.exitCode).toBeUndefined()
    expect(JSON.parse(String(log.mock.calls[0][0])).result.reason).toBe('connected')

    remoteCallMock.mockResolvedValue({ result: { capabilities: ['orcad.x.v1'] } })
    await handler({ client: { call: localCall }, flags, json: true } as never)
    expect(process.exitCode).toBe(1)
  })

  it('pide --environment', async () => {
    const handler = ENVIRONMENT_CHECK_HANDLERS['environment check']
    await expect(
      handler({ client: { call: vi.fn() }, flags: new Map(), json: false } as never)
    ).rejects.toThrow('Missing required --environment')
  })
})
