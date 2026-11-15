import { describe, expect, it } from 'vitest'
import { parseCliAgent } from './agent-launch-request'

describe('parseCliAgent', () => {
  it.each(['chatgpt', 'gpt', 'openai', 'ChatGPT', ' GPT '])('entiende «%s» como Codex', (value) => {
    expect(parseCliAgent(value)).toBe('codex')
  })

  it('deja pasar los ids de siempre', () => {
    expect(parseCliAgent('codex')).toBe('codex')
    expect(parseCliAgent('claude')).toBe('claude')
  })

  it('rechaza un nombre que no es motor ni alias, y lo cita como vino', () => {
    expect(() => parseCliAgent('copilot-x')).toThrow('Unknown TUI agent "copilot-x"')
  })
})
