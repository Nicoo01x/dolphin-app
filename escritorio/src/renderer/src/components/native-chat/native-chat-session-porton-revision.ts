import type { DolphinPortonRevision } from '../../../../shared/dolphin-console-types'
import { isTextBlock, type NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'

function plainTextOf(message: NativeChatMessage): string {
  return message.blocks
    .filter(isTextBlock)
    .map((block) => block.text)
    .join('\n')
    .trim()
}

export function revisionForSession(
  messages: readonly NativeChatMessage[],
  baseRef: string | undefined
): DolphinPortonRevision | undefined {
  const tarea = messages
    .toReversed()
    .find((message) => message.role === 'user' && plainTextOf(message) !== '')
  const tareaTexto = tarea ? plainTextOf(tarea) : ''
  if (!tareaTexto) {
    return undefined
  }
  const assistant = messages
    .toReversed()
    .find((message) => message.role === 'assistant' && message.model?.trim())
  return {
    tarea: tareaTexto,
    ...(assistant?.model ? { escribio: assistant.model } : {}),
    ...(baseRef ? { base: baseRef } : {})
  }
}
