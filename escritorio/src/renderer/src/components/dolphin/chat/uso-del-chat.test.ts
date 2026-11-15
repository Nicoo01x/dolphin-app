import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { nombreDelModelo, tokensCortos, usoDelChat } from './uso-del-chat'

const mensaje = (
  id: string,
  role: NativeChatMessage['role'],
  extra: Partial<NativeChatMessage> = {}
): NativeChatMessage => ({
  id,
  role,
  blocks: [{ type: 'text', text: id }],
  timestamp: null,
  source: 'transcript',
  ...extra
})

const uso = (leido: number) => ({
  inputTokens: 10,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: leido - 10,
  outputTokens: 100
})

describe('el uso del chat', () => {
  it('toma el modelo y el contexto de la última respuesta que los dice', () => {
    expect(
      usoDelChat([
        mensaje('1', 'assistant', { model: 'claude-sonnet-5-5', usage: uso(1_000) }),
        mensaje('2', 'user'),
        mensaje('3', 'assistant', { model: 'claude-opus-5-5', usage: uso(45_210) }),
        mensaje('4', 'assistant')
      ])
    ).toMatchObject({ model: 'claude-opus-5-5', contextTokens: 45_210 })
  })

  it('suma el uso de la sesión una sola vez por id de mensaje', () => {
    const repetida = mensaje('respuesta-1', 'assistant', {
      model: 'claude-opus-5-5',
      usage: uso(1_000)
    })
    const otra = mensaje('respuesta-2', 'assistant', { usage: uso(2_000) })
    expect(
      usoDelChat([repetida, { ...repetida, usage: uso(1_500) }, otra]).billableByModel
    ).toEqual([
      {
        model: 'claude-opus-5-5',
        tokens: { inputTokens: 20, outputTokens: 200, cacheReadTokens: 3_480, cacheWriteTokens: 0 }
      }
    ])
  })

  it('agrupa el uso por modelo y conserva el último modelo conocido para respuestas sin modelo', () => {
    expect(
      usoDelChat([
        mensaje('opus', 'assistant', { model: 'claude-opus-5-5', usage: uso(1_000) }),
        mensaje('sonnet', 'assistant', { model: 'claude-sonnet-5-5', usage: uso(2_000) }),
        mensaje('sin-modelo', 'assistant', { usage: uso(3_000) })
      ]).billableByModel
    ).toEqual([
      {
        model: 'claude-opus-5-5',
        tokens: { inputTokens: 10, outputTokens: 100, cacheReadTokens: 990, cacheWriteTokens: 0 }
      },
      {
        model: 'claude-sonnet-5-5',
        tokens: { inputTokens: 20, outputTokens: 200, cacheReadTokens: 4_980, cacheWriteTokens: 0 }
      }
    ])
  })

  it('no adivina un modelo futuro para una respuesta anterior sin modelo', () => {
    expect(
      usoDelChat([
        mensaje('sin-modelo', 'assistant', { usage: uso(1_000) }),
        mensaje('opus', 'assistant', { model: 'claude-opus-5-5', usage: uso(2_000) })
      ]).billableByModel
    ).toEqual([
      {
        model: null,
        tokens: { inputTokens: 10, outputTokens: 100, cacheReadTokens: 990, cacheWriteTokens: 0 }
      },
      {
        model: 'claude-opus-5-5',
        tokens: { inputTokens: 10, outputTokens: 100, cacheReadTokens: 1_990, cacheWriteTokens: 0 }
      }
    ])
  })

  it('las filas de una misma respuesta de la API cuentan una vez aunque tengan otro id', () => {
    const fila = (id: string) => mensaje(id, 'assistant', { usageId: 'msg_01', usage: uso(1_000) })
    expect(usoDelChat([fila('uuid-a'), fila('uuid-b'), fila('uuid-c')]).billableByModel).toEqual([
      {
        model: null,
        tokens: { inputTokens: 10, outputTokens: 100, cacheReadTokens: 990, cacheWriteTokens: 0 }
      }
    ])
  })

  it('sin respuestas que lo digan no inventa nada', () => {
    expect(usoDelChat([mensaje('1', 'user'), mensaje('2', 'assistant')])).toEqual({
      model: null,
      contextTokens: null,
      billableByModel: null
    })
  })

  it('nombra los modelos de Claude como se leen, y deja los demás como vinieron', () => {
    expect(nombreDelModelo('claude-opus-5-5')).toBe('Opus 5.5')
    expect(nombreDelModelo('claude-sonnet-5')).toBe('Sonnet 5')
    expect(nombreDelModelo('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(nombreDelModelo('claude-sonnet-4-20250514')).toBe('Sonnet 4')
    expect(nombreDelModelo('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5')
    expect(nombreDelModelo('gpt-5.5-codex')).toBe('gpt-5.5-codex')
  })

  it('acorta los tokens sin perder la escala', () => {
    expect(tokensCortos(812)).toBe('812')
    expect(tokensCortos(45_210)).toBe('45k')
    expect(tokensCortos(999_499)).toBe('999k')
    expect(tokensCortos(999_700)).toBe('1M')
    expect(tokensCortos(1_250_000, 'es-AR')).toBe('1,3M')
  })
})
