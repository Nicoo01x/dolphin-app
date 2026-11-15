import { describe, expect, it, vi } from 'vitest'
import { agentSessionRecordFixture } from '../../../native-chat/agent-session-record-test-fixture'
import { createCodexStructuredLaunchResolver } from '../../../runtime/agent-session/launch/structured-agent-launch-composition.test-support'
import type { AgentSessionRecord } from '../../../../shared/agent-session/lifecycle/agent-session-record'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import { DOLPHIN_AGENT_CONTEXT } from '../../../../shared/dolphin-agent-context'
import { openCodexThread } from './codex-structured-thread-open'

vi.mock('../../../windows/windows-process-table', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isWindowsProcessStartTimeAvailable: () => true
}))

const SESSION_ID = 'session-1'
const IDENTITY = { sessionId: SESSION_ID } as Parameters<
  ReturnType<typeof createCodexStructuredLaunchResolver>
>[0]['identity']

const RECORD: AgentSessionRecord = agentSessionRecordFixture({
  sessionId: SESSION_ID,
  provider: 'codex',
  location: {
    executionHostId: LOCAL_EXECUTION_HOST_ID,
    wslDistro: null,
    workspaceId: 'workspace-1',
    workspaceKind: 'git-worktree'
  },
  accountHome: { variable: 'CODEX_HOME', path: '/home/work/.codex' },
  providerHandleChain: []
})

function resolverWith(resolveDolphinContext?: () => string | null) {
  return createCodexStructuredLaunchResolver({
    store: { getRecord: () => RECORD, pinLaunchDirectory: vi.fn() },
    resolveWorkspacePath: async (id) => `/repos/${id}`,
    resolveCommand: () => ({ command: '/usr/local/bin/codex', prefixArgs: [] }),
    resolveLaunchArgs: () => [],
    ...(resolveDolphinContext ? { resolveDolphinContext } : {})
  })
}

describe('el aviso de Dolphin en el chat de Codex', () => {
  it('va en las developer instructions del lanzamiento', async () => {
    const launch = await resolverWith(() => DOLPHIN_AGENT_CONTEXT)({ identity: IDENTITY })
    expect(launch.developerInstructions).toBe(DOLPHIN_AGENT_CONTEXT)
    const off = await resolverWith(() => null)({ identity: IDENTITY })
    expect(off).not.toHaveProperty('developerInstructions')
  })

  it.each([
    ['thread/start', null],
    ['thread/resume', 'thread-existing']
  ] as const)('llega a %s como developerInstructions del hilo', async (method, resumeThreadId) => {
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({
      thread: { id: resumeThreadId ?? 'thread-new' }
    }))
    await openCodexThread(
      { request },
      { cwd: '/workspace', resumeThreadId, developerInstructions: DOLPHIN_AGENT_CONTEXT },
      2_000
    )
    expect(request.mock.calls[0]?.[0]).toBe(method)
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      developerInstructions: DOLPHIN_AGENT_CONTEXT
    })
  })

  it('sin aviso, el hilo no manda el campo y Codex usa su configuración', async () => {
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => ({
      thread: { id: 'thread-new' }
    }))
    await openCodexThread({ request }, { cwd: '/workspace', resumeThreadId: null }, 2_000)
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty('developerInstructions')
  })
})
