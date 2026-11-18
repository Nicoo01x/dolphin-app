import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient, RuntimeClientError } from '../runtime-client'
import { normalizeCommandPositionals, parseArgs } from '../args'
import { COMMAND_SPECS } from '../specs'
import { HOST_SETUP_HANDLERS } from './host-setup'

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = undefined
})

const SAVED = {
  id: 'ssh-1',
  label: 'my-vps',
  host: '203.0.113.10',
  port: 22,
  username: 'root',
  identityFile: '/home/me/.ssh/id_ed25519'
}

type Answers = Record<string, unknown | ((params: unknown) => unknown)>

function clientAnswering(answers: Answers): {
  client: RuntimeClient
  call: ReturnType<typeof vi.spyOn>
} {
  const client = new RuntimeClient()
  const call = vi
    .spyOn(client, 'call')
    .mockImplementation(async (method: string, params?: unknown) => {
      const answer = answers[method]
      if (answer === undefined) {
        throw new Error(`unexpected ${method}`)
      }
      const result = typeof answer === 'function' ? await answer(params) : answer
      return { id: 'r', ok: true, result, _meta: { runtimeId: 'runtime-1' } } as never
    })
  return { client, call }
}

function parsed(argv: string[]) {
  return normalizeCommandPositionals(COMMAND_SPECS, parseArgs(argv, undefined, COMMAND_SPECS))
}

async function run(argv: string[], client: RuntimeClient): Promise<unknown> {
  const { commandPath, flags } = parsed(argv)
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await HOST_SETUP_HANDLERS[commandPath.join(' ')]({ flags, client, cwd: '/tmp', json: true })
  return JSON.parse(String(log.mock.calls.at(-1)?.[0]))
}

describe('dolphin host add', () => {
  it('saves the host through ssh.addTarget without contacting it', async () => {
    const { client, call } = clientAnswering({
      'ssh.listEditableTargets': { targets: [] },
      'ssh.addTarget': (params) => ({
        target: { ...SAVED, ...(params as { target: object }).target }
      })
    })
    const out = await run(
      ['host', 'add', '--address', '203.0.113.10', '--user', 'root', '--label', 'my-vps'],
      client
    )
    expect(call).toHaveBeenCalledWith('ssh.addTarget', {
      target: { label: 'my-vps', host: '203.0.113.10', port: 22, username: 'root' }
    })
    expect(call).not.toHaveBeenCalledWith('ssh.connect', expect.anything(), expect.anything())
    expect(out).toMatchObject({ result: { created: true, target: { id: 'ssh-1' } } })
  })

  it('returns a host already saved instead of adding it twice', async () => {
    const { client, call } = clientAnswering({ 'ssh.listEditableTargets': { targets: [SAVED] } })
    const out = await run(['host', 'add', '--address', '203.0.113.10', '--user', 'root'], client)
    expect(call).not.toHaveBeenCalledWith('ssh.addTarget', expect.anything())
    expect(out).toMatchObject({ result: { created: false } })
  })

  it('connects with --install-server and reports a failed connect as a diagnosis', async () => {
    const { client } = clientAnswering({
      'ssh.listEditableTargets': { targets: [SAVED] },
      'ssh.getState': { state: null, lastFailure: { reason: 'timeout', nextStep: 'Check it.' } },
      'ssh.connect': () => {
        throw new RuntimeClientError('runtime_error', 'SSH connection unavailable')
      }
    })
    const out = await run(
      ['host', 'add', '--address', '203.0.113.10', '--user', 'root', '--install-server'],
      client
    )
    expect(out).toMatchObject({ result: { doctor: { ok: false, reason: 'timeout' } } })
    expect(process.exitCode).toBe(1)
  })

  it('refuses a bad port and a remote selection before calling the runtime', async () => {
    const { client, call } = clientAnswering({})
    await expect(
      run(['host', 'add', '--address', 'h', '--user', 'u', '--port', '70000'], client)
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    await expect(
      run(['host', 'add', '--address', 'h', '--user', 'u', '--environment', 'box'], client)
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).not.toHaveBeenCalled()
  })
})

describe('dolphin host doctor', () => {
  const summaries = { targets: [{ id: 'ssh-1', label: 'my-vps' }] }

  it('leaves a connected, served host alone and reports it ready', async () => {
    const { client, call } = clientAnswering({
      'ssh.listTargetSummaries': summaries,
      'ssh.listEditableTargets': { targets: [SAVED] },
      'ssh.getState': {
        state: {
          targetId: 'ssh-1',
          status: 'connected',
          error: null,
          reconnectAttempt: 0,
          managedServer: { kind: 'managed', environmentId: 'env-1' }
        }
      }
    })
    const out = await run(['host', 'doctor', 'my-vps'], client)
    expect(call).not.toHaveBeenCalledWith('ssh.connect', expect.anything(), expect.anything())
    expect(out).toMatchObject({ result: { ok: true, server: 'running', connectAttempted: false } })
  })

  it('connects a disconnected host and explains the failure without secrets', async () => {
    const { client, call } = clientAnswering({
      'ssh.listTargetSummaries': summaries,
      'ssh.listEditableTargets': { targets: [SAVED] },
      'ssh.getState': { state: null, lastFailure: { reason: 'auth', nextStep: 'Check the key.' } },
      'ssh.connect': () => {
        throw new RuntimeClientError('runtime_error', 'SSH authentication failed')
      }
    })
    const out = (await run(['host', 'doctor', 'ssh-1'], client)) as { result: object }
    expect(call).toHaveBeenCalledWith('ssh.connect', { targetId: 'ssh-1' }, expect.anything())
    expect(out.result).toMatchObject({ ok: false, reason: 'auth', connectAttempted: true })
    expect(JSON.stringify(out)).toContain('-i /home/me/.ssh/id_ed25519 root@203.0.113.10')
    expect(process.exitCode).toBe(1)
  })

  it('lets a runtime that is not running surface as a CLI error', async () => {
    const { client } = clientAnswering({
      'ssh.listTargetSummaries': summaries,
      'ssh.listEditableTargets': { targets: [SAVED] },
      'ssh.getState': { state: null },
      'ssh.connect': () => {
        throw new RuntimeClientError('runtime_unavailable', 'Dolphin is not running')
      }
    })
    await expect(run(['host', 'doctor', 'ssh-1'], client)).rejects.toMatchObject({
      code: 'runtime_unavailable'
    })
  })
})
