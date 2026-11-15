import { describe, expect, it } from 'vitest'
import { getTuiAgentLaunchCommand, isTuiAgent, TUI_AGENT_CONFIG } from './agent-launch/catalog/tui-agent-config'
import { TUI_AGENT_DISPLAY_NAMES } from './agent-launch/catalog/tui-agent-display-names'
import { TUI_AGENT_AUTO_PICK_ORDER } from './agent-launch/catalog/tui-agent-selection'
import { tuiAgentToAgentKind } from './agent-kind'

/**
 * Dolphin como agente del «+»: es el de esta app, no un CLI que se instala aparte (Nico, 31/10).
 * Lo que se prueba acá es lo que decide si aparece en el selector y qué se escribe en la terminal.
 */

describe('Dolphin como agente', () => {
  it('se lanza con el CLI de esta app, con el nombre que corresponde en cada sistema', () => {
    expect(isTuiAgent('dolphin')).toBe(true)
    expect(getTuiAgentLaunchCommand(TUI_AGENT_CONFIG.dolphin, 'win32')).toBe('dolphin.cmd')
    expect(getTuiAgentLaunchCommand(TUI_AGENT_CONFIG.dolphin, 'linux')).toBe('dolphin')
    expect(getTuiAgentLaunchCommand(TUI_AGENT_CONFIG.dolphin, 'darwin')).toBe('dolphin')
  })

  it('se detecta por «dolphin», y el alias de desarrollo también cuenta', () => {
    expect(TUI_AGENT_CONFIG.dolphin.detectCmd).toBe('dolphin')
    expect(TUI_AGENT_CONFIG.dolphin.detectCmdAliases).toContain('dolphin-dev')
    // No pide tener otro CLI instalado para aparecer: el motor se elige adentro.
    expect(TUI_AGENT_CONFIG.dolphin.detectRequiredCommands).toBeUndefined()
  })

  it('es el primero que se elige solo, antes que los de afuera', () => {
    expect(TUI_AGENT_AUTO_PICK_ORDER[0]).toBe('dolphin')
  })

  it('tiene su nombre y su propio valor en telemetría, no cae en «other»', () => {
    expect(TUI_AGENT_DISPLAY_NAMES.dolphin).toBe('Dolphin')
    expect(tuiAgentToAgentKind('dolphin')).toBe('dolphin')
  })
})
