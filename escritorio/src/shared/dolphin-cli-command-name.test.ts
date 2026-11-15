import { describe, expect, it } from 'vitest'
import { installFakeAppEnvironment } from '../../config/scripts/test-runtime/environment/vitest-host-ports-setup'
import { getTuiAgentLaunchCommand, TUI_AGENT_CONFIG } from './agent-launch/catalog/tui-agent-config'

const agentTeams = TUI_AGENT_CONFIG['claude-agent-teams']

describe('Claude Agent Teams launch name on the launching host', () => {
  it('uses plain dolphin on a headless Linux server, whose PATH has no dolphin-ide (#33920)', () => {
    installFakeAppEnvironment({ getCliLauncherPath: () => '/home/u/.dolphin/cli/bin/dolphin' })
    expect(getTuiAgentLaunchCommand(agentTeams, 'linux')).toBe('dolphin claude-teams')
  })

  // El renombre `-ide` de la base esquiva el lector de pantalla de GNOME; Dolphin no lo usa y su
  // comando en Linux es `dolphin` también para WSL (getDolphinCliCommandNameForPlatform).
  it('uses plain dolphin for WSL under a Windows server too: Dolphin has no -ide rename', () => {
    installFakeAppEnvironment({
      getCliLauncherPath: () => 'C:\\Users\\u\\.dolphin\\cli\\bin\\dolphin.exe'
    })
    expect(getTuiAgentLaunchCommand(agentTeams, 'linux')).toBe('dolphin claude-teams')
  })
})
