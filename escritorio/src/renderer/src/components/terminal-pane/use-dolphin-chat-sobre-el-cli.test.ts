// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector({ agentStatusByPaneKey: {} })
}))

import {
  marcarTerminalElegida,
  terminalElegida,
  useDolphinChatSobreElCli
} from './use-dolphin-chat-sobre-el-cli'

const props = (tabId: string, toggleNativeChatForLeaf: (leafId: string) => void) => ({
  tabId,
  unifiedTabId: `u-${tabId}`,
  effectiveChatViewMode: false,
  tabAgentTypeByLeaf: { leaf: 'claude' },
  isChatEligibleForLeaf: () => true,
  toggleNativeChatForLeaf
})

describe('el chat sobre el CLI', () => {
  beforeEach(() => window.localStorage.clear())

  it('un agente nuevo en una terminal pasa solo a la vista de chat', () => {
    const toggle = vi.fn()
    renderHook(() => useDolphinChatSobreElCli(props('tab-1', toggle)))
    expect(toggle).toHaveBeenCalledWith('leaf')
  })

  it('si la persona eligió «Terminal», la pestaña se queda en el CLI', () => {
    const toggle = vi.fn()
    marcarTerminalElegida('tab-2')
    expect(terminalElegida('tab-2')).toBe(true)
    renderHook(() => useDolphinChatSobreElCli(props('tab-2', toggle)))
    expect(toggle).not.toHaveBeenCalled()
  })
})
