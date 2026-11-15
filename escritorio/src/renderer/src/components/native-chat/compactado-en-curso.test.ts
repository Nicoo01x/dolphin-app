// El aviso de «se está compactando» se apaga por tres caminos y ninguno puede quedar afuera: la
// marca del compactado, el tope, y que lo que se mandó no sea un `/compact`.

import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { NativeChatCommandMarker } from './session/terminal/delivery/native-chat-command-marker'
import { compactadoEnCurso, compactadoSinMarca, TOPE_DE_COMPACTADO_MS } from './compactado-en-curso'

const ARRANQUE = 1_700_000_000_000

function marca(command: string, sentAt: number): NativeChatCommandMarker {
  return { id: `${sentAt}`, command, sentAt }
}

function filaDeCompactado(timestamp: number | null): NativeChatMessage {
  return {
    id: `compaction:${timestamp ?? 'sin-hora'}`,
    role: 'system',
    blocks: [{ type: 'text', text: 'Context compacted', presentation: 'compaction' }],
    timestamp,
    source: 'scrape'
  }
}

function filaComun(timestamp: number): NativeChatMessage {
  return {
    id: `user:${timestamp}`,
    role: 'user',
    blocks: [{ type: 'text', text: 'hola' }],
    timestamp,
    source: 'scrape'
  }
}

describe('compactado en curso', () => {
  it('sin ningún /compact no anuncia nada', () => {
    expect(
      compactadoEnCurso({
        markers: [marca('/clear', ARRANQUE)],
        messages: [filaComun(ARRANQUE + 10)],
        ahora: ARRANQUE + 1_000
      })
    ).toBeNull()
  })

  it('con un /compact que todavía no dejó marca, lo anuncia desde que se mandó', () => {
    expect(
      compactadoEnCurso({
        markers: [marca('/compact', ARRANQUE)],
        messages: [filaComun(ARRANQUE - 5_000)],
        ahora: ARRANQUE + 3_000
      })
    ).toEqual({ desde: ARRANQUE })
  })

  it('un /compact con instrucción adentro sigue siendo un /compact', () => {
    expect(
      compactadoSinMarca({
        markers: [marca('  /COMPACT dejá sólo lo del deploy  ', ARRANQUE)],
        messages: []
      })
    ).toEqual({ desde: ARRANQUE })
  })

  it('cuando la marca del compactado entra en la conversación, se apaga', () => {
    expect(
      compactadoEnCurso({
        markers: [marca('/compact', ARRANQUE)],
        messages: [filaDeCompactado(ARRANQUE + 20_000)],
        ahora: ARRANQUE + 25_000
      })
    ).toBeNull()
  })

  it('una marca ANTERIOR es de otro compactado y no apaga el de ahora', () => {
    expect(
      compactadoEnCurso({
        markers: [marca('/compact', ARRANQUE)],
        messages: [filaDeCompactado(ARRANQUE - 60_000)],
        ahora: ARRANQUE + 5_000
      })
    ).toEqual({ desde: ARRANQUE })
  })

  it('una marca sin hora cuenta como llegada: sin hora no hay con qué ordenar', () => {
    expect(
      compactadoEnCurso({
        markers: [marca('/compact', ARRANQUE)],
        messages: [filaDeCompactado(null)],
        ahora: ARRANQUE + 5_000
      })
    ).toBeNull()
  })

  it('pasado el tope deja de anunciarse, aunque nunca haya llegado la marca', () => {
    const args = { markers: [marca('/compact', ARRANQUE)], messages: [] }
    expect(compactadoEnCurso({ ...args, ahora: ARRANQUE + TOPE_DE_COMPACTADO_MS - 1 })).toEqual({
      desde: ARRANQUE
    })
    expect(compactadoEnCurso({ ...args, ahora: ARRANQUE + TOPE_DE_COMPACTADO_MS })).toBeNull()
  })

  it('con dos /compact manda el más nuevo', () => {
    expect(
      compactadoSinMarca({
        markers: [marca('/compact', ARRANQUE), marca('/compact', ARRANQUE - 30_000)],
        messages: [filaDeCompactado(ARRANQUE - 20_000)]
      })
    ).toEqual({ desde: ARRANQUE })
  })
})
