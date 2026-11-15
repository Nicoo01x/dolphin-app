import { describe, expect, it, vi } from 'vitest'
import { agentSessionRecordFixture } from '../../../native-chat/agent-session-record-test-fixture'
import { createClaudeStructuredLaunchResolver } from '../../../runtime/agent-session/launch/structured-agent-launch-composition.test-support'
import type { AgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { DOLPHIN_AGENT_CONTEXT } from '../../../../shared/dolphin-agent-context'
import { claudeDolphinContextSystemPrompt } from './claude-structured-launch-resolution'

const SESSION_ID = 'dolphin-session-1'
const IDENTITY = { sessionId: SESSION_ID } as Parameters<
  ReturnType<typeof createClaudeStructuredLaunchResolver>
>[0]['identity']

const RECORD: AgentSessionRecord = agentSessionRecordFixture({
  sessionId: SESSION_ID,
  provider: 'claude',
  location: {
    executionHostId: LOCAL_EXECUTION_HOST_ID,
    wslDistro: null,
    workspaceId: 'workspace-1',
    workspaceKind: 'folder'
  },
  accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: '/home/work/.claude' },
  providerHandleChain: []
})

function resolverWith(resolveDolphinContext?: () => string | null) {
  return createClaudeStructuredLaunchResolver({
    store: { getRecord: () => RECORD, pinLaunchDirectory: vi.fn() },
    resolveWorkspacePath: async (id) => `/repos/${id}`,
    resolveCommand: () => ({ command: '/usr/local/bin/claude', prefixArgs: [] }),
    resolveAuthPolicy: () => ({ account: 'system' }),
    hasTranscript: async () => false,
    // Lo que la persona puso a mano no puede pisar ni borrar el aviso: el flag es de Dolphin.
    resolveLaunchArgs: () => ['--append-system-prompt', 'texto del usuario'],
    ...(resolveDolphinContext ? { resolveDolphinContext } : {})
  })
}

describe('el aviso de Dolphin en el chat de Claude', () => {
  it('llega como append del system prompt de Claude Code, que se conserva', async () => {
    const launch = await resolverWith(() => DOLPHIN_AGENT_CONTEXT)({ identity: IDENTITY })
    expect(launch.options.systemPrompt).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: DOLPHIN_AGENT_CONTEXT
    })
    expect(launch.options.extraArgs).not.toHaveProperty('append-system-prompt')
  })

  it('apagado, el chat arranca con el prompt de siempre', async () => {
    for (const resolver of [resolverWith(() => null), resolverWith()]) {
      const launch = await resolver({ identity: IDENTITY })
      expect(launch.options.systemPrompt).toEqual({ type: 'preset', preset: 'claude_code' })
    }
  })

  it('no agrega nada sin texto', () => {
    expect(claudeDolphinContextSystemPrompt(null)).toEqual({})
  })
})
