import { describe, expect, it } from 'vitest'
import { ventanaDeContexto } from './DolphinCliChatSidePanel'

describe('el contexto del chat sobre el CLI', () => {
  it('supone 200k salvo que el modelo diga 1M', () => {
    expect(ventanaDeContexto('claude-opus-5-5')).toBe(200_000)
    expect(ventanaDeContexto('claude-opus-5-5[1m]')).toBe(1_000_000)
    expect(ventanaDeContexto(null)).toBe(200_000)
  })
})
