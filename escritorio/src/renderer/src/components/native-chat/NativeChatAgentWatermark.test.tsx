import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NativeChatAgentWatermark } from './NativeChatAgentWatermark'

describe('NativeChatAgentWatermark', () => {
  it.each([
    ['claude', 'claude'],
    ['claude-agent-teams', 'claude'],
    ['codex', 'codex'],
    ['gemini', 'gemini'],
    ['antigravity', 'gemini']
  ] as const)('combines Dolphin with the %s motor mark', (agent, motor) => {
    const markup = renderToStaticMarkup(<NativeChatAgentWatermark agent={agent} />)

    expect(markup).toContain(`data-native-chat-agent-motor="${motor}"`)
    expect((markup.match(/<svg/g) ?? []).length).toBe(2)
  })

  it('keeps only Dolphin for an unknown motor', () => {
    const markup = renderToStaticMarkup(<NativeChatAgentWatermark agent="unknown-agent" />)

    expect(markup).not.toContain('data-native-chat-agent-motor=')
    expect((markup.match(/<svg/g) ?? []).length).toBe(1)
  })

  it('is hidden from assistive technology and cannot receive pointer input', () => {
    const markup = renderToStaticMarkup(<NativeChatAgentWatermark agent="codex" />)

    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('pointer-events-none')
    expect(markup).not.toContain('<button')
  })
})
