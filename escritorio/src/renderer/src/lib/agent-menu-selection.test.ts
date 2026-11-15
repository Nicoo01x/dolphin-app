import { expect, it } from 'vitest'
import { resolveAgentMenuSelection } from './agent-session/launch/routing/agent-menu-selection'

const input = {
  settings: { agentDefaultSurface: 'terminal' as const },
  executionHostId: 'local' as const,
  inventoryReady: true,
  answer: 'yes' as const,
  chatPending: false,
  plain: false
}

it('honors an explicit chat choice when the global default is terminal', () => {
  expect(resolveAgentMenuSelection({ ...input, agent: 'claude', surface: 'chat' })).toMatchObject({
    ready: true,
    cli: false,
    choice: { route: 'structured-native-chat', requestedSurface: 'chat' }
  })
})

it('keeps an agent without chat support on its single terminal option', () => {
  expect(
    resolveAgentMenuSelection({
      ...input,
      agent: 'gemini',
      answer: 'no-chats',
      surface: undefined
    })
  ).toMatchObject({ ready: true, cli: true, choice: { route: 'terminal-tui' } })
  expect(
    resolveAgentMenuSelection({ ...input, agent: 'gemini', answer: 'no-chats', surface: 'chat' })
  ).toMatchObject({ ready: true, cli: true, choice: { route: 'terminal-tui' } })
})
