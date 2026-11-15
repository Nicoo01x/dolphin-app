// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { NativeChatComposerProps } from '../../../native-chat/composer/native-chat-composer-types'
import { composerConCola, useComposerConPausaAlDetener } from './cola-junto-al-composer'
import { cambiarCola, claveDeCola, leerCola } from './cola-del-chat-store'

const base = {
  terminalTabId: 'tab-1',
  paneKey: 'tab-1:leaf-1',
  agent: 'claude',
  targetPtyId: 'pty-1'
} as NativeChatComposerProps

describe('la cola junto al composer', () => {
  it('sólo el chat sobre el CLI tiene cola', () => {
    expect(composerConCola(base)).toBe(true)
    expect(
      composerConCola({ ...base, launchPrompt: { placeholder: '', onEmptySubmit: vi.fn() } })
    ).toBe(false)
  })

  it('Stop frena al agente y deja la cola en pausa', () => {
    const clave = claveDeCola(base.paneKey, base.agent)
    cambiarCola(clave, () => ({
      mensajes: [{ id: 'a', texto: 'después', imagenes: [], encoladoEn: 0 }],
      pausa: null
    }))
    const onStop = vi.fn()
    const { result } = renderHook(() => useComposerConPausaAlDetener({ ...base, onStop }))
    result.current.onStop?.()
    expect(onStop).toHaveBeenCalledOnce()
    expect(leerCola(clave).pausa).toBe('detenido')
  })

  it('sin Stop no inventa uno', () => {
    const { result } = renderHook(() => useComposerConPausaAlDetener(base))
    expect(result.current.onStop).toBeUndefined()
  })
})
