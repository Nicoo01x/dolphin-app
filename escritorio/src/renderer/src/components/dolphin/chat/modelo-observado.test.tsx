// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { ConModeloObservado, useModeloObservado } from './modelo-observado'

const respuesta = (id: string, model?: string): NativeChatMessage => ({
  id,
  role: 'assistant',
  blocks: [{ type: 'text', text: id }],
  timestamp: null,
  source: 'transcript',
  ...(model
    ? {
        model,
        usage: {
          inputTokens: 10,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          outputTokens: 5
        }
      }
    : {})
})

const con =
  (messages: readonly NativeChatMessage[]) =>
  ({ children }: { children: ReactNode }) => (
    <ConModeloObservado messages={messages}>{children}</ConModeloObservado>
  )

describe('el modelo que el chat usa de verdad', () => {
  it('sale de la última respuesta que lo dice, con el nombre de la barra', () => {
    const { result } = renderHook(() => useModeloObservado(), {
      wrapper: con([respuesta('1', 'claude-sonnet-5-5'), respuesta('2', 'claude-opus-5-5')])
    })
    expect(result.current).toBe('Opus 5.5')
  })

  it('sin respuestas todavía no hay modelo: el botón sigue diciendo «Modelo»', () => {
    expect(renderHook(() => useModeloObservado(), { wrapper: con([]) }).result.current).toBeNull()
    expect(renderHook(() => useModeloObservado()).result.current).toBeNull()
  })
})
