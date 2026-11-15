import { createAcpStructuredLaunchResolver } from '../runtime/agent-session/launch/structured-agent-launch-composition.test-support'
import { describe, expect, it, vi } from 'vitest'
import type { AgentSessionRecord } from '../../shared/agent-session/lifecycle/agent-session-record'
import { agentSessionRecordFixture } from '../../shared/agent-session/lifecycle/agent-session-record.test-fixture'
import { agentSessionSetupFor } from '../../shared/agent-session/lifecycle/agent-session-setup-commands'
import { agentChatPermissionModes } from '../../shared/agent-launch/permissions/agent-chat-permission-support'
import { acpLaunchSpecFor } from './launch/acp-launch-registry'
import { GENERIC_ACP_DIALECT } from './acp-dialects/acp-dialect'

const GEMINI = acpLaunchSpecFor('gemini')!
const identity = {
  sessionId: 'session-gemini-1',
  workspaceId: 'workspace-1',
  hostId: 'local',
  agent: 'gemini',
  providerHandle: null
}

function geminiRecord(
  accountHome: AgentSessionRecord['accountHome'] = {
    variable: 'GEMINI_CLI_HOME',
    path: '/home/user'
  }
): AgentSessionRecord {
  return {
    ...agentSessionRecordFixture(),
    provider: 'gemini',
    providerHandleChain: [],
    accountHome
  }
}

function resolver(
  record: AgentSessionRecord,
  options: {
    launchEnv?: Record<string, string>
    probeVersion?: Parameters<typeof createAcpStructuredLaunchResolver>[1]['probeVersion']
  } = {}
) {
  return createAcpStructuredLaunchResolver(GEMINI, {
    store: { getRecord: () => record, pinLaunchDirectory: vi.fn() },
    readJournal: () => null,
    resolveWorkspacePath: async () => '/repo/worktree',
    resolveEnvironment: async () => ({ PATH: '/usr/bin', HOME: '/home/user' }),
    resolveLaunchEnv: () => options.launchEnv ?? {},
    resolveCommand: (command) => `/resolved/${command}`,
    inheritedEnv: {},
    probeVersion: options.probeVersion ?? (async () => ({ version: '0.65.0' }))
  })
}

describe('el chat de Gemini por ACP', () => {
  it('corre `gemini --acp` y solo con Acceso total le pide el modo yolo', async () => {
    const ask = await resolver(geminiRecord())({
      identity,
      spawnToken: 'token',
      permissionMode: 'ask'
    })
    expect(ask).toMatchObject({ command: '/resolved/gemini', args: ['--acp'], fullAccess: false })
    const full = await resolver(geminiRecord())({
      identity,
      spawnToken: 'token',
      permissionMode: 'full-access'
    })
    expect(full).toMatchObject({
      args: ['--acp', '--approval-mode', 'yolo'],
      fullAccess: true
    })
  })

  it('apunta Gemini a la carpeta que el chat fijó, aunque el entorno nombre otra', async () => {
    const launch = await resolver(geminiRecord(), {
      launchEnv: { GEMINI_CLI_HOME: '/data/otra' }
    })({ identity })
    expect(launch.env.GEMINI_CLI_HOME).toBe('/home/user')
  })

  it('le pasa la clave de API de la persona tal cual: Gemini la lee sola al abrir la sesión', async () => {
    const launch = await resolver(geminiRecord(), {
      launchEnv: { GEMINI_API_KEY: 'clave-de-prueba' }
    })({ identity })
    expect(launch.env.GEMINI_API_KEY).toBe('clave-de-prueba')
  })

  it('rechaza un registro que fija la carpeta de otro agente', async () => {
    await expect(
      resolver(geminiRecord({ variable: 'GEMINI_HOME', path: '/data/antigravity-chat' }))({
        identity
      })
    ).rejects.toThrow(/pin GEMINI_CLI_HOME/)
  })

  // Desde el merge con la base (11/11) el piso es `minimumVersions`, que compara por semver: una
  // preview o nightly de una versión posterior al piso pasa, cosa que el `supportsVersion` de
  // Dolphin (sólo estables) no dejaba.
  it.each(['0.65.0', '0.66.1', '1.0.0', '0.66.0-preview.1', '0.66.0-nightly.20261020'])(
    'acepta Gemini %s',
    async (version) => {
      const launch = resolver(geminiRecord(), {
        probeVersion: async () => ({ version })
      })
      await expect(launch({ identity })).resolves.toMatchObject({ args: ['--acp'] })
    }
  )

  it.each(['0.64.9', '0.30.0', '0.65.0-preview.1'])(
    'rechaza Gemini %s antes de lanzarlo y pide actualizar a 0.65.0',
    async (version) => {
      const launch = resolver(geminiRecord(), {
        probeVersion: async () => ({ version })
      })
      await expect(launch({ identity })).rejects.toMatchObject({
        name: 'AgentSessionPreSpawnError',
        installation: { agent: 'gemini', installedVersion: version, minimumVersion: '0.65.0' }
      })
    }
  )
})

describe('lo que el resto de Dolphin sabe de un chat de Gemini', () => {
  it('nunca elige un método de ingreso: `authenticate` pisaría el que la cuenta ya eligió', () => {
    expect(GEMINI.authMethod).toBeUndefined()
    expect(GEMINI.signIn).toBeUndefined()
  })

  it('manda a ingresar desde la terminal de Gemini, con `/auth`', () => {
    expect(GEMINI.loginCommand).toEqual(['gemini'])
    expect(agentSessionSetupFor('gemini')).toMatchObject({ slashCommand: '/auth' })
  })

  it('ofrece Preguntar y Acceso total, como los otros agentes ACP sin modo propio', () => {
    expect(agentChatPermissionModes('gemini')?.modes).toEqual(['ask', 'full-access'])
    expect(GEMINI.permissionModeConfig).toBeUndefined()
  })

  // Why sin `imagePrompts`: la base sacó esa bandera del spec de ACP.
  it('habla ACP sin extensiones y no lista modelos fuera de un chat', () => {
    expect(GEMINI.dialect).toBe(GENERIC_ACP_DIALECT)
    expect(GEMINI.compaction).toBeUndefined()
    expect(GEMINI.modelDiscovery.kind).toBe('unavailable')
    expect(GEMINI.transcriptImport).toBeNull()
  })
})
