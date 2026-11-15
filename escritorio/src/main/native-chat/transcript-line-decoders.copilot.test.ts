import { describe, expect, it } from 'vitest'
import { decodeCopilotTranscriptLine } from './transcript-line-decoders'

/**
 * Las filas de abajo están copiadas de un `events.jsonl` real de Copilot CLI 1.0.105, recortando
 * los campos que el decodificador no mira. No son un formato supuesto.
 */
describe('decodeCopilotTranscriptLine', () => {
  it('decodes a user turn with what the person typed, not the transformed prompt', () => {
    const line = JSON.stringify({
      type: 'user.message',
      data: {
        content: 'hola?',
        // El CLI le pega adelante su propia maquinaria; eso no lo escribió nadie.
        transformedContent:
          '<current_datetime>2026-11-05T10:21:53.291-03:00</current_datetime>\n\nhola?',
        messageId: '15ad7933-13b8-4d46-97dd-4c7b14788726',
        turnId: '0'
      },
      id: '677421a8-a2d5-431c-9b61-98fd47969da6',
      timestamp: '2026-11-05T13:21:53.291Z'
    })
    expect(decodeCopilotTranscriptLine(line, 'fb-1')).toEqual({
      id: '15ad7933-13b8-4d46-97dd-4c7b14788726',
      role: 'user',
      blocks: [{ type: 'text', text: 'hola?' }],
      timestamp: Date.parse('2026-11-05T13:21:53.291Z'),
      source: 'transcript',
      turnId: '0'
    })
  })

  it('decodes an assistant turn with its real model', () => {
    const line = JSON.stringify({
      type: 'assistant.message',
      data: {
        messageId: 'bb27ecbf-f33f-49fd-8599-64ce1419caef',
        model: 'gpt-6-luna',
        content: '¡Hola! ¿En qué te puedo ayudar?',
        toolRequests: [],
        turnId: '0',
        phase: 'final_answer'
      },
      timestamp: '2026-11-05T13:22:00.454Z'
    })
    expect(decodeCopilotTranscriptLine(line, 'fb-2')).toEqual({
      id: 'bb27ecbf-f33f-49fd-8599-64ce1419caef',
      role: 'assistant',
      blocks: [{ type: 'text', text: '¡Hola! ¿En qué te puedo ayudar?' }],
      timestamp: Date.parse('2026-11-05T13:22:00.454Z'),
      source: 'transcript',
      turnId: '0',
      model: 'gpt-6-luna'
    })
  })

  it('decodes tool requests next to the answer', () => {
    const line = JSON.stringify({
      type: 'assistant.message',
      data: {
        content: 'Leo el archivo.',
        toolRequests: [{ id: 'tr-1', name: 'view', input: { path: 'a.ts' } }]
      }
    })
    expect(decodeCopilotTranscriptLine(line, 'fb-3')).toMatchObject({
      role: 'assistant',
      blocks: [
        { type: 'text', text: 'Leo el archivo.' },
        { type: 'tool-call', name: 'view', input: { path: 'a.ts' }, callId: 'tr-1' }
      ]
    })
  })

  it('leaves the system prompt out of the conversation', () => {
    // `system.message` es el prompt de sistema entero. Dibujarlo pondría miles de palabras de
    // instrucciones arriba del primer mensaje de la persona.
    const line = JSON.stringify({
      type: 'system.message',
      data: { role: 'system', content: 'You are the GitHub Copilot CLI, a terminal assistant…' }
    })
    expect(decodeCopilotTranscriptLine(line, 'fb-4')).toBeNull()
  })

  it('leaves the internal model calls out of the conversation', () => {
    // El CLI le pide el título de la sesión a un modelo barato; su respuesta no es una respuesta.
    const respuesta = JSON.stringify({
      type: 'model.response',
      data: {
        modelCall: { model: 'gpt-4o-mini' },
        response: { content: '<session-title>Session Not Required</session-title>' }
      }
    })
    expect(decodeCopilotTranscriptLine(respuesta, 'fb-5')).toBeNull()
    expect(
      decodeCopilotTranscriptLine(JSON.stringify({ type: 'model.message', data: {} }), 'fb-5')
    ).toBeNull()
    expect(
      decodeCopilotTranscriptLine(JSON.stringify({ type: 'session.start', data: {} }), 'fb-5')
    ).toBeNull()
  })

  it('never throws on junk', () => {
    expect(decodeCopilotTranscriptLine('', 'fb-6')).toBeNull()
    expect(decodeCopilotTranscriptLine('no soy json', 'fb-6')).toBeNull()
    expect(decodeCopilotTranscriptLine(JSON.stringify({ type: 'user.message' }), 'fb-6')).toBeNull()
    expect(
      decodeCopilotTranscriptLine(JSON.stringify({ type: 'user.message', data: {} }), 'fb-6')
    ).toBeNull()
  })
})
