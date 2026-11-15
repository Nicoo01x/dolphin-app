import { describe, expect, it } from 'vitest'
import { decodeCursorTranscriptLine } from './transcript-line-decoders'

/**
 * Las formas de fila son las que ya usa la fixture del baúl
 * (`ai-vault/session-scanner-log-agent-fixtures.ts`), que es la única evidencia del formato de
 * Cursor que hay en el repo. Si ese formato cambia, estos tests y el escáner del baúl tienen que
 * caerse juntos: son el mismo archivo en disco leído por dos caminos.
 */
describe('decodeCursorTranscriptLine', () => {
  it('decodes a user turn with the content inside `message`', () => {
    const line = JSON.stringify({
      role: 'user',
      message: { content: [{ type: 'text', text: 'Cursor title' }] },
      timestamp: '2026-11-07T10:00:00.000Z'
    })
    expect(decodeCursorTranscriptLine(line, 'fb-1')).toEqual({
      id: 'fb-1',
      role: 'user',
      blocks: [{ type: 'text', text: 'Cursor title' }],
      timestamp: Date.parse('2026-11-07T10:00:00.000Z'),
      source: 'transcript'
    })
  })

  it('decodes an assistant turn and keeps its model', () => {
    const line = JSON.stringify({
      role: 'assistant',
      message: { content: [{ type: 'text', text: 'Done' }], model: 'composer-1', id: 'm-9' }
    })
    expect(decodeCursorTranscriptLine(line, 'fb-2')).toEqual({
      id: 'fb-2:m-9',
      role: 'assistant',
      blocks: [{ type: 'text', text: 'Done' }],
      timestamp: null,
      source: 'transcript',
      model: 'composer-1'
    })
  })

  it('accepts the content at the top level too', () => {
    const line = JSON.stringify({ role: 'user', content: 'plain text' })
    expect(decodeCursorTranscriptLine(line, 'fb-3')).toMatchObject({
      role: 'user',
      blocks: [{ type: 'text', text: 'plain text' }]
    })
  })

  it('decodes tool calls and tool results from the Anthropic-shaped content', () => {
    const call = JSON.stringify({
      role: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: 't1', name: 'read_file', input: { path: 'a.ts' } }]
      }
    })
    expect(decodeCursorTranscriptLine(call, 'fb-4')).toMatchObject({
      role: 'assistant',
      blocks: [{ type: 'tool-call', name: 'read_file', input: { path: 'a.ts' }, callId: 't1' }]
    })
  })

  it('does not put a tool result in the person’s mouth', () => {
    // El CLI devuelve la salida de la herramienta en una fila `user`, que es el mismo lugar donde
    // van los pedidos. Dibujarla como burbuja de la persona le atribuye la salida de un comando.
    const line = JSON.stringify({
      role: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'file contents' }] }
    })
    expect(decodeCursorTranscriptLine(line, 'fb-5')).toMatchObject({
      role: 'tool',
      blocks: [{ type: 'tool-result', output: 'file contents', callId: 't1' }]
    })
  })

  it('skips rows that are not a turn, and never throws on junk', () => {
    expect(decodeCursorTranscriptLine('', 'fb-6')).toBeNull()
    expect(decodeCursorTranscriptLine('no soy json', 'fb-6')).toBeNull()
    expect(decodeCursorTranscriptLine(JSON.stringify({ role: 'system' }), 'fb-6')).toBeNull()
    // Una fila sin contenido legible no es un turno vacío: es una fila que no se entiende.
    expect(
      decodeCursorTranscriptLine(JSON.stringify({ role: 'assistant', message: {} }), 'fb-6')
    ).toBeNull()
  })
})
