import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DOLPHIN_AGENT_CONTEXT } from '../../shared/dolphin-agent-context'
import {
  buildProjectMemoryHookResponse,
  type ProjectAgentMemorySettings
} from './project-agent-memory'

const repos: string[] = []

function repoWithRule(rule: string): string {
  const repo = mkdtempSync(join(tmpdir(), 'dolphin-context-hook-'))
  repos.push(repo)
  mkdirSync(join(repo, '.dolphin'))
  writeFileSync(
    join(repo, '.dolphin', 'memoria.json'),
    JSON.stringify({ recuerdos: [{ id: 'r1', dicho: rule, tipo: 'regla' }] }),
    'utf8'
  )
  return repo
}

function respond(
  source: 'claude' | 'gemini',
  body: Record<string, unknown>,
  settings: ProjectAgentMemorySettings,
  repo: string | null
) {
  return buildProjectMemoryHookResponse(
    source,
    body,
    { getSettings: () => settings, resolveRepoPath: () => repo },
    new Set<string>()
  )
}

function additionalContext(response: string): string {
  return JSON.parse(response).hookSpecificOutput.additionalContext
}

afterEach(() => {
  for (const repo of repos.splice(0)) {
    rmSync(repo, { recursive: true, force: true })
  }
})

describe('el aviso de Dolphin en el SessionStart de las terminales', () => {
  it.each(['claude', 'gemini'] as const)(
    'le llega a %s aunque el proyecto no tenga memoria',
    async (source) => {
      const response = await respond(
        source,
        { hook_event_name: 'SessionStart', session_id: 's1' },
        {},
        null
      )
      expect(JSON.parse(response).hookSpecificOutput.hookEventName).toBe('SessionStart')
      expect(additionalContext(response)).toBe(DOLPHIN_AGENT_CONTEXT)
    }
  )

  it('va antes de la memoria cuando la hay, en el mismo bloque', async () => {
    const response = await respond(
      'claude',
      { hook_event_name: 'SessionStart', session_id: 's1' },
      { projectMemoryEnabled: true },
      repoWithRule('Usá pnpm')
    )
    const context = additionalContext(response)
    expect(context.startsWith(DOLPHIN_AGENT_CONTEXT)).toBe(true)
    expect(context).toContain('Memoria del proyecto (Dolphin):')
    expect(context).toContain('Usá pnpm')
  })

  it('apagado no manda nada, y con la memoria apagada tampoco hay bloque', async () => {
    await expect(
      respond(
        'claude',
        { hook_event_name: 'SessionStart', session_id: 's1' },
        { dolphinContextEnabled: false, projectMemoryEnabled: false },
        repoWithRule('Usá pnpm')
      )
    ).resolves.toBe('')
  })

  it('no se repite en cada mensaje: sólo al arrancar la sesión', async () => {
    const response = await respond(
      'claude',
      { hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'hola' },
      {},
      null
    )
    expect(response).toBe('')
  })

  it('se vuelve a mandar en otro SessionStart de la misma sesión, como después de compactar', async () => {
    const sent = new Set<string>()
    const options = { getSettings: () => ({}), resolveRepoPath: () => null }
    const body = { hook_event_name: 'SessionStart', session_id: 's1', source: 'compact' }
    await buildProjectMemoryHookResponse('claude', body, options, sent)
    const again = await buildProjectMemoryHookResponse('claude', body, options, sent)
    expect(additionalContext(again)).toBe(DOLPHIN_AGENT_CONTEXT)
  })
})
