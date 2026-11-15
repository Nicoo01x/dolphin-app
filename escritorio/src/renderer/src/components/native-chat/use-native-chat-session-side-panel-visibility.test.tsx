// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useNativeChatSessionSidePanelVisibility } from './use-native-chat-session-side-panel-visibility'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('useNativeChatSessionSidePanelVisibility', () => {
  it('keeps the session side panel closed until the user opens it', () => {
    const { result } = renderHook(() => useNativeChatSessionSidePanelVisibility())

    expect(result.current.visible).toBe(false)

    act(() => result.current.toggle())
    expect(result.current.visible).toBe(true)
    expect(window.localStorage.getItem('dolphin.native-chat-session-side-panel')).toBe('1')

    act(() => result.current.toggle())
    expect(result.current.visible).toBe(false)
  })

  it('restores an explicit open choice', () => {
    window.localStorage.setItem('dolphin.native-chat-session-side-panel', '1')

    const { result } = renderHook(() => useNativeChatSessionSidePanelVisibility())

    expect(result.current.visible).toBe(true)
  })
})
