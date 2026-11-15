import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPtyHostEnv } from './assembly'
import type { BuildPtyHostEnvOptions } from './types'

const fixture = vi.hoisted(() => ({ userData: '', launcher: null as string | null }))
vi.mock('../../../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => fixture.userData, onWillQuit: vi.fn() })
}))
vi.mock('../../../agent-hooks/server/agent-hook-server', () => ({
  agentHookServer: { buildPtyEnv: () => ({}) }
}))
vi.mock('../../../agent-hooks/wsl-relay/wsl-hook-relay-manager', () => ({
  wslHookRelayManager: {
    ensureForDistro: vi.fn(),
    getGuestEndpointFilePath: () => '/guest/endpoint.json',
    getOpenCodeOverlayDir: () => null,
    getClaudeAgentView: () => null,
    getGuestAgentPath: () => null
  }
}))
vi.mock('../../../pi/titlebar-extension-service', () => ({
  piTitlebarExtensionService: { buildPtyEnv: () => ({}), buildFreshOmpEnv: () => ({}) }
}))
// The launcher the real helper resolves: Windows packaged is `<resources>/bin/dolphin.exe`.
vi.mock('../../../cli/launchers/dolphin-cli-child-path', () => ({
  prependDolphinCliDirToChildPath: () => fixture.launcher
}))
vi.mock('../../../cli/wsl/wsl-managed-cli', () => ({
  getManagedWslCliDir: () => undefined,
  getWslCliCommandName: () => 'dolphin-ide'
}))

const PACKAGED_LAUNCHER =
  'C:\\Users\\nico\\AppData\\Local\\Programs\\Dolphin\\resources\\bin\\dolphin.exe'

let root: string
let options: BuildPtyHostEnvOptions

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dolphin-cli-command-'))
  fixture.userData = join(root, 'user-data')
  fixture.launcher = PACKAGED_LAUNCHER
  vi.stubEnv('HOME', root)
  vi.stubEnv('USERPROFILE', root)
  options = {
    isPackaged: true,
    userDataPath: fixture.userData,
    selectedCodexHomePath: null,
    agentStatusHooksEnabled: false
  }
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

describe('DOLPHIN_CLI_COMMAND en las terminales', () => {
  it('apunta al CLI de esta app aunque herede el de otro Dolphin', () => {
    const env = buildPtyHostEnv(
      'pane',
      { DOLPHIN_CLI_COMMAND: 'C:\\Users\\nico\\AppData\\Roaming\\npm\\dolphin.cmd' },
      options
    )
    expect(env.DOLPHIN_CLI_COMMAND).toBe(PACKAGED_LAUNCHER)
  })

  it('no inventa uno cuando el launcher no se resolvió', () => {
    fixture.launcher = null
    const env = buildPtyHostEnv('pane', { DOLPHIN_CLI_COMMAND: 'C:\\otro\\dolphin.exe' }, options)
    expect(env.DOLPHIN_CLI_COMMAND).toBeUndefined()
  })

  it('en WSL sigue anunciando el CLI de WSL, no la ruta de Windows', () => {
    const env = buildPtyHostEnv('pane', {}, { ...options, isWsl: true, wslDistro: 'Ubuntu' })
    expect(env.DOLPHIN_CLI_COMMAND).toBe('dolphin-ide')
  })
})
