import { ClaudeIcon, GeminiIcon, OpenAIIcon } from '../status-bar/icons'
import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import { DolphinMark } from '../dolphin/DolphinMark'

type WatermarkMotor = 'claude' | 'codex' | 'gemini'

function watermarkMotor(agent: AgentType): WatermarkMotor | null {
  if (agent === 'claude' || agent === 'claude-agent-teams') {
    return 'claude'
  }
  if (agent === 'codex') {
    return 'codex'
  }
  if (agent === 'gemini' || agent === 'antigravity') {
    return 'gemini'
  }
  return null
}

function MotorIcon({ motor }: { motor: WatermarkMotor }): React.JSX.Element {
  if (motor === 'claude') {
    return <ClaudeIcon size={112} />
  }
  if (motor === 'codex') {
    return <OpenAIIcon size={112} />
  }
  return <GeminiIcon size={112} />
}

/** A quiet, non-interactive identity mark that stays behind one agent's conversation. */
export function NativeChatAgentWatermark({ agent }: { agent: AgentType }): React.JSX.Element {
  const motor = watermarkMotor(agent)
  return (
    <div
      aria-hidden="true"
      data-native-chat-agent-watermark
      data-native-chat-agent={agent}
      {...(motor ? { 'data-native-chat-agent-motor': motor } : {})}
      className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden select-none"
    >
      <div className="flex items-center gap-10 text-chat-foreground-faint opacity-[0.05] [&_path]:fill-current">
        <DolphinMark className="h-48 w-60 shrink-0" />
        {motor ? (
          <span data-native-chat-agent-motor-icon>
            <MotorIcon motor={motor} />
          </span>
        ) : null}
      </div>
    </div>
  )
}
