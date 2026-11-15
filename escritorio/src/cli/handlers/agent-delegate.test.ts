import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import type { ChatTranscriptEntry } from '../chat-sessions'
import {
  createAgentDelegateHandler,
  delegatedReply,
  type AgentDelegateDeps
} from './agent-delegate'

const SESSION = 'codex_8eb631ab_59c5_41e4_8672_01cfe0a6fd5f'
const WORKTREE = 'id:repo-1::/projects/app'

// Los dobles llevan sólo los campos que el handler lee; `never` los deja pasar por los tipos del wire.
function rpc(result: unknown): never {
  return { id: 'req', ok: true, result, _meta: { runtimeId: 'runtime-1' } } as never
}

function launched(kind: 'structured' | 'terminal' = 'structured', prompt = 'journaled'): never {
  return rpc({
    outcome:
      kind === 'structured'
        ? { kind, handle: `chat:${SESSION}`, sessionId: SESSION }
        : { kind, handle: 'term_1' },
    worktreeId: 'repo-1::/projects/app',
    receipt: { mode: kind, reason: 'requested', detail: 'You asked for a chat.' },
    prompt:
      prompt === 'journaled' ? { outcome: 'journaled', messageId: 'm-1' } : { outcome: prompt },
    operationId: 'op-1'
  })
}

function page(fields: Record<string, unknown>): never {
  return rpc({ ok: true, page: { working: false, actionablePromptIds: [], ...fields } })
}

function transcript(entries: ChatTranscriptEntry[]): never {
  return rpc({ session: SESSION, entries, cursor: null, truncated: false })
}

const TURN: ChatTranscriptEntry[] = [
  { kind: 'tool', name: 'Bash', state: 'completed' },
  { kind: 'message', role: 'assistant', text: 'Revisé el diff: hay un bug en la línea 12.' }
]

type Deps = AgentDelegateDeps
type MockedDeps = { [K in keyof Deps]: Mock<Deps[K]> }

function fakeDeps(overrides: Partial<MockedDeps> = {}): MockedDeps {
  let clock = 0
  return {
    getCapabilities: vi.fn<Deps['getCapabilities']>(async () => ['agent.launch']),
    launch: vi.fn<Deps['launch']>(async () => launched()),
    // Primero el chat todavía no arrancó el turno; después ya está trabajando.
    readHistory: vi
      .fn<Deps['readHistory']>()
      .mockResolvedValueOnce(page({ working: false }))
      .mockResolvedValue(page({ working: true })),
    readTranscript: vi.fn<Deps['readTranscript']>(async () =>
      transcript([{ kind: 'message', role: 'user', text: 'Revisá el diff' }])
    ),
    waitForChat: vi.fn<Deps['waitForChat']>(async () => 'done'),
    readSettledTurn: vi.fn<Deps['readSettledTurn']>(async (_client, _session, settled) =>
      rpc({ session: SESSION, entries: TURN, cursor: null, truncated: false, settled })
    ),
    resolveWorktree: vi.fn<Deps['resolveWorktree']>(async () => WORKTREE),
    sleep: vi.fn<Deps['sleep']>(async (ms) => {
      clock += ms
    }),
    now: vi.fn<Deps['now']>(() => clock),
    ...overrides
  }
}

async function run(deps: AgentDelegateDeps, flags: Record<string, string | boolean>) {
  const client = new RuntimeClient('/tmp/dolphin-delegate-test', 60_000, null, null)
  const logs: string[] = []
  const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => logs.push(line))
  try {
    await createAgentDelegateHandler(deps)({
      flags: new Map(Object.entries(flags)),
      client,
      cwd: '/projects/app',
      json: true
    })
  } finally {
    spy.mockRestore()
  }
  return JSON.parse(logs.join('\n')).result
}

afterEach(() => {
  process.exitCode = undefined
  vi.restoreAllMocks()
})

describe('agent delegate', () => {
  it('lanza el chat en este worktree, espera a que arranque y a que termine, y trae la respuesta', async () => {
    const deps = fakeDeps()
    const result = await run(deps, {
      agent: 'chatgpt',
      prompt: 'Revisá el diff',
      wait: true,
      'timeout-ms': '600000'
    })

    expect(deps.launch).toHaveBeenCalledTimes(1)
    const [, launch, request] = deps.launch.mock.calls[0]!
    expect(launch).toMatchObject({
      agent: 'codex',
      surface: 'chat',
      prompt: { text: 'Revisá el diff', delivery: 'submit' }
    })
    expect(request).toEqual({
      target: { kind: 'existing', worktree: WORKTREE },
      presentation: 'background'
    })
    // No delega la espera hasta ver el turno en marcha: antes de eso el chat parece terminado.
    expect(deps.readHistory).toHaveBeenCalledTimes(2)
    expect(deps.waitForChat).toHaveBeenCalledWith(expect.anything(), SESSION, expect.any(Number))
    const remaining = deps.waitForChat.mock.calls[0]![2]!
    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThanOrEqual(600_000)
    expect(result).toMatchObject({
      agent: 'codex',
      session: SESSION,
      surface: 'chat',
      prompt: 'journaled',
      settled: 'done',
      reply: 'Revisé el diff: hay un bug en la línea 12.'
    })
    expect(process.exitCode).toBeUndefined()
  })

  it('sale con error y lo dice cuando el otro agente pide permiso', async () => {
    const deps = fakeDeps({ waitForChat: vi.fn<Deps['waitForChat']>(async () => 'blocked') })
    const result = await run(deps, {
      agent: 'codex',
      prompt: 'Instalá las dependencias',
      wait: true
    })
    expect(result.settled).toBe('blocked')
    expect(process.exitCode).toBe(1)
  })

  it('sin --wait devuelve la sesión apenas el chat tiene la tarea', async () => {
    const deps = fakeDeps()
    const result = await run(deps, { agent: 'gemini', prompt: 'Escribí los tests' })
    expect(deps.launch.mock.calls[0]![1]).toMatchObject({ agent: 'gemini', surface: 'chat' })
    expect(deps.readHistory).not.toHaveBeenCalled()
    expect(deps.waitForChat).not.toHaveBeenCalled()
    expect(result).toMatchObject({ session: SESSION, surface: 'chat' })
    expect(result.settled).toBeUndefined()
  })

  it('no espera una terminal: devuelve el handle y sale con error', async () => {
    const deps = fakeDeps({
      launch: vi.fn<Deps['launch']>(async () => launched('terminal', 'handed-to-terminal'))
    })
    const result = await run(deps, { agent: 'codex', prompt: 'Hacelo', wait: true })
    expect(result).toMatchObject({ surface: 'terminal', handle: 'term_1' })
    expect(deps.waitForChat).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('si el turno ya terminó antes de mirar, no se queda esperando el arranque', async () => {
    const deps = fakeDeps({
      readHistory: vi.fn<Deps['readHistory']>(async () => page({ working: false })),
      readTranscript: vi.fn<Deps['readTranscript']>(async () =>
        transcript([{ kind: 'message', role: 'user', text: 'Hacelo' }, ...TURN])
      )
    })
    await run(deps, { agent: 'codex', prompt: 'Hacelo', wait: true })
    expect(deps.sleep).not.toHaveBeenCalled()
    expect(deps.waitForChat).toHaveBeenCalledTimes(1)
  })

  it('rechaza una tarea vacía antes de lanzar nada', async () => {
    const deps = fakeDeps()
    await expect(run(deps, { agent: 'codex', prompt: '   ' })).rejects.toThrow(
      'The task for the other agent must not be empty.'
    )
    expect(deps.launch).not.toHaveBeenCalled()
  })
})

describe('delegatedReply', () => {
  it('es el último mensaje del agente, no el del usuario', () => {
    expect(
      delegatedReply([
        { kind: 'message', role: 'assistant', text: 'primero' },
        { kind: 'message', role: 'assistant', text: 'último' },
        { kind: 'tool', name: 'Bash', state: 'completed' }
      ])
    ).toBe('último')
    expect(delegatedReply([{ kind: 'message', role: 'user', text: 'hola' }])).toBeNull()
  })
})
