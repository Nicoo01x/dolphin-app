import { describe, expect, it } from 'vitest'
import { AJUSTES_POR_DEFECTO_DOLPHIN } from './default-global-settings-dolphin'
import {
  DOLPHIN_AGENT_CONTEXT,
  dolphinAgentContextEnabled,
  dolphinAgentContextFor,
  dolphinAgentContextHostDeps
} from './dolphin-agent-context'

describe('el aviso «estás en Dolphin»', () => {
  it('dice dónde está el CLI y cómo delegar sin plugins externos', () => {
    expect(DOLPHIN_AGENT_CONTEXT).toContain('DOLPHIN_CLI_COMMAND')
    expect(DOLPHIN_AGENT_CONTEXT).toContain('agent delegate --agent codex')
    expect(DOLPHIN_AGENT_CONTEXT).toContain('agent launch --agent codex --surface chat')
    expect(DOLPHIN_AGENT_CONTEXT).toContain('chat wait')
    expect(DOLPHIN_AGENT_CONTEXT).toContain('codex:rescue')
    expect(DOLPHIN_AGENT_CONTEXT).toContain('ChatGPT')
    expect(DOLPHIN_AGENT_CONTEXT).toContain('dolphin-cli')
  })

  it('es corto y sólo ASCII, porque también entra al bundle de dolphind', () => {
    expect(DOLPHIN_AGENT_CONTEXT.split('\n').length).toBeLessThanOrEqual(15)
    expect(/^[\x20-\x7e\n]*$/.test(DOLPHIN_AGENT_CONTEXT)).toBe(true)
  })

  it('está prendido por defecto y se apaga sólo si la persona lo apaga', () => {
    expect(AJUSTES_POR_DEFECTO_DOLPHIN.agentDolphinContextEnabled).toBe(true)
    expect(dolphinAgentContextEnabled(undefined)).toBe(true)
    expect(dolphinAgentContextEnabled({})).toBe(true)
    expect(dolphinAgentContextEnabled({ agentDolphinContextEnabled: false })).toBe(false)
    expect(dolphinAgentContextFor({ agentDolphinContextEnabled: false })).toBeNull()
    expect(dolphinAgentContextFor({})).toBe(DOLPHIN_AGENT_CONTEXT)
  })

  it('el host relee el ajuste en cada chat que arranca', () => {
    let settings: { agentDolphinContextEnabled?: boolean } = {}
    const host = dolphinAgentContextHostDeps(() => settings)
    expect(host.isEnabled()).toBe(true)
    settings = { agentDolphinContextEnabled: false }
    expect(host.isEnabled()).toBe(false)
  })
})
