import { describe, expect, it } from 'vitest'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

const linea = (record: Record<string, unknown>): string => JSON.stringify(record)

describe('Claude transcript model and usage', () => {
  it('keeps the model that answered and what it read, as the API accounted it', () => {
    const decoded = decodeClaudeTranscriptLine(
      linea({
        type: 'assistant',
        uuid: 'a1',
        message: {
          model: 'claude-opus-5-5',
          content: [{ type: 'text', text: 'Listo.' }],
          usage: {
            input_tokens: 12,
            cache_creation_input_tokens: 3_000,
            cache_read_input_tokens: 40_000,
            output_tokens: 250
          }
        }
      }),
      'fallback'
    )

    expect(decoded).toMatchObject({
      role: 'assistant',
      model: 'claude-opus-5-5',
      usage: {
        inputTokens: 12,
        cacheCreationInputTokens: 3_000,
        cacheReadInputTokens: 40_000,
        outputTokens: 250
      }
    })
  })

  it('leaves out the synthetic rows the CLI makes up and their all-zero usage', () => {
    const decoded = decodeClaudeTranscriptLine(
      linea({
        type: 'assistant',
        uuid: 'a2',
        message: {
          model: '<synthetic>',
          content: [{ type: 'text', text: 'API Error' }],
          usage: { input_tokens: 0, output_tokens: 0 }
        }
      }),
      'fallback'
    )

    expect(decoded).not.toHaveProperty('model')
    expect(decoded).not.toHaveProperty('usage')
  })

  it('keeps the API response id so rows of the same response count their usage once', () => {
    const fila = (uuid: string) =>
      decodeClaudeTranscriptLine(
        linea({
          type: 'assistant',
          uuid,
          message: {
            id: 'msg_01',
            model: 'claude-opus-5-5',
            content: [{ type: 'text', text: uuid }],
            usage: { input_tokens: 12, output_tokens: 250 }
          }
        }),
        'fallback'
      )

    expect(fila('a3')).toMatchObject({ id: 'a3', usageId: 'msg_01' })
    expect(fila('a4')).toMatchObject({ id: 'a4', usageId: 'msg_01' })
  })

  it('never puts a model on what the person wrote', () => {
    const decoded = decodeClaudeTranscriptLine(
      linea({
        type: 'user',
        uuid: 'u1',
        message: { model: 'claude-opus-5-5', content: [{ type: 'text', text: 'hola' }] }
      }),
      'fallback'
    )

    expect(decoded).not.toHaveProperty('model')
  })
})
