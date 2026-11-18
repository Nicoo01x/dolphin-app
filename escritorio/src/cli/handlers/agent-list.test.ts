import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { createAgentListHandler, formatAgentList, toAgentListEntries } from './agent-list'

function reply(result: unknown): never {
  return { id: 'req', ok: true, result, _meta: { runtimeId: 'runtime-1' } } as never
}

async function run(worktreeId: string | null, detected: string[], json = true) {
  const client = new RuntimeClient('/tmp/dolphin-agent-list-test', 60_000, null, null)
  const call = vi.spyOn(client, 'call').mockResolvedValue(reply(detected))
  const logs: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => logs.push(line))
  await createAgentListHandler({ currentWorktreeId: async () => worktreeId })({
    flags: new Map(),
    client,
    cwd: '/projects/app',
    json
  })
  return { call, output: logs.join('\n') }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('agent list', () => {
  it('pregunta por el host del espacio de trabajo y devuelve id, nombre y alias', async () => {
    const { call, output } = await run('repo-1::/projects/app', ['claude', 'codex'])

    expect(call).toHaveBeenCalledWith('preflight.detectAgents', {
      worktreeId: 'repo-1::/projects/app'
    })
    expect(JSON.parse(output).result).toEqual({
      worktreeId: 'repo-1::/projects/app',
      agents: [
        { id: 'claude', name: 'Claude', aliases: [] },
        { id: 'codex', name: 'Codex', aliases: ['chatgpt', 'gpt', 'openai'] }
      ]
    })
  })

  it('fuera de un espacio de trabajo pregunta por el host entero', async () => {
    const { call, output } = await run(null, ['gemini'])

    expect(call).toHaveBeenCalledWith('preflight.detectAgents', {})
    expect(JSON.parse(output).result).toEqual({
      agents: [{ id: 'gemini', name: 'Gemini', aliases: [] }]
    })
  })

  it('en texto avisa que encontrado no quiere decir logueado, y qué hacer si no hay ninguno', () => {
    const lleno = formatAgentList({ agents: toAgentListEntries(['codex']) })
    expect(lleno).toContain('codex\tCodex (also: chatgpt, gpt, openai)')
    expect(lleno).toContain('does not prove the agent is signed in')
    expect(formatAgentList({ agents: [] })).toContain('No agent CLI was found')
  })
})
