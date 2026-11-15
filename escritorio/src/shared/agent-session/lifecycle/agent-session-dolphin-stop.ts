// The host records quit/update/crash on the cut-turn row for Continue. Unknown wire causes retain the row's words without a named cause.

export const AGENT_SESSION_DOLPHIN_STOP_CAUSES = ['update', 'quit', 'crash'] as const
/** The row's presentation, so a client that re-words host rows it can't name passes it through. */
export const AGENT_SESSION_DOLPHIN_STOP_PRESENTATION = 'dolphin-stop'
export type AgentSessionDolphinStopCause = (typeof AGENT_SESSION_DOLPHIN_STOP_CAUSES)[number]
export type AgentSessionDolphinStop = { cause: AgentSessionDolphinStopCause }

export function isAgentSessionDolphinStopCause(
  value: unknown
): value is AgentSessionDolphinStopCause {
  return AGENT_SESSION_DOLPHIN_STOP_CAUSES.some((cause) => cause === value)
}

/** The stop a row states, when this build knows its cause. */
export function readAgentSessionDolphinStop(value: unknown): AgentSessionDolphinStop | undefined {
  const cause =
    typeof value === 'object' && value !== null && 'cause' in value ? value.cause : undefined
  return isAgentSessionDolphinStopCause(cause) ? { cause } : undefined
}
