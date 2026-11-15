import { translate } from '@/i18n/i18n'

export function getAgentDolphinContextTitle(): string {
  return translate(
    'auto.components.settings.agent-dolphin-context-copy.title',
    'Tell agents they are in Dolphin'
  )
}

export function getAgentDolphinContextDescription(): string {
  return translate(
    'auto.components.settings.agent-dolphin-context-copy.description',
    'Tells Claude, Codex and Gemini they run inside Dolphin and how to hand work to another agent, so you see both chats.'
  )
}
