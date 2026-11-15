import { overlayEnvironmentVariables } from '../../environment-overlay'

export const CLAUDE_ENTRYPOINT_ENV = 'CLAUDE_CODE_ENTRYPOINT'
const DOLPHIN_CLAUDE_CHAT_ENTRYPOINT = 'dolphin'

/** Only structured chats own this identity; other Claude processes retain their CLI default. */
export function withDolphinClaudeChatEntrypoint(
  env: Readonly<Record<string, string>>,
  platform: NodeJS.Platform
): Record<string, string> {
  return overlayEnvironmentVariables(
    env,
    { [CLAUDE_ENTRYPOINT_ENV]: DOLPHIN_CLAUDE_CHAT_ENTRYPOINT },
    platform
  )
}
