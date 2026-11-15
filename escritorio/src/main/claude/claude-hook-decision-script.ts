import { CLAUDE_PRE_TOOL_USE_DECISION } from '../agent-hooks/tool-events/agent-tool-plugin-hooks'
import { CLAUDE_PERMISSION_REQUEST_DECISION } from '../agent-hooks/server/claude-permission-hook-hold'

/**
 * Dolphin: la memoria del proyecto. En SessionStart y UserPromptSubmit el servidor de hooks contesta
 * `{"hookSpecificOutput":{"hookEventName":…,"additionalContext":…}}` (`buildProjectMemoryHookResponse`).
 *
 * Why un modo más acá: con el `*)` de la base esos eventos imprimían `{}` antes de postear y la
 * respuesta se tiraba, así que Claude Code nunca recibía el contexto. Ahora esperan la respuesta como
 * PreToolUse y la imprimen sólo si es contexto para ese mismo evento; si no hay, sale `{}` igual.
 * El servidor no mira este valor de la cabecera: la memoria la contesta por el cuerpo del evento.
 */
const DOLPHIN_PROJECT_CONTEXT_DECISION = 'dolphin-project-context-v1'

/**
 * Lets Claude Code's PreToolUse hook print Dolphin's answer (plugins' `agent.tool.before`), and its
 * PermissionRequest hook print a coordinator's or person's answer, instead of a fixed `{}`. Every
 * other event still prints `{}` before it posts. The answer is printed only when it is a decision
 * for that same event; a timeout, an error or no answer prints `{}`, so Claude asks as usual.
 */
export function buildPosixClaudeDecisionPreludeLines(): string[] {
  return [
    'dolphin_hook_printed=',
    'dolphin_hook_answer=',
    'dolphin_hook_decides=',
    // An early exit (a skip path) still prints the `{}` Claude Code needs.
    'dolphin_hook_finish() {',
    '  [ -z "$dolphin_hook_printed" ] || return 0',
    '  if [ -n "$dolphin_hook_answer" ]; then printf \'%s\\n\' "$dolphin_hook_answer"; else printf \'{}\\n\'; fi',
    '}',
    'trap dolphin_hook_finish EXIT'
  ]
}

export function buildPosixClaudeDecisionModeLines(): string[] {
  return [
    'case "$payload" in',
    `  *'"hook_event_name":"PreToolUse"'*|*'"hook_event_name": "PreToolUse"'*) dolphin_hook_decides=${CLAUDE_PRE_TOOL_USE_DECISION}; max_time=8 ;;`,
    // Why 126 s: Dolphin answers within its 122 s hold; the managed entry's 130 s timeout outlasts both.
    // An async entry's output is ignored, so it answers `{}` first like any other event.
    `  *'"hook_event_name":"PermissionRequest"'*|*'"hook_event_name": "PermissionRequest"'*) if [ -n "\${DOLPHIN_HOOK_ASYNC:-}" ]; then printf '{}\\n'; dolphin_hook_printed=1; else dolphin_hook_decides=${CLAUDE_PERMISSION_REQUEST_DECISION}; max_time=126; fi ;;`,
    `  *'"hook_event_name":"SessionStart"'*|*'"hook_event_name": "SessionStart"'*|*'"hook_event_name":"UserPromptSubmit"'*|*'"hook_event_name": "UserPromptSubmit"'*) dolphin_hook_decides=${DOLPHIN_PROJECT_CONTEXT_DECISION} ;;`,
    "  *) printf '{}\\n'; dolphin_hook_printed=1 ;;",
    'esac'
  ]
}

/** Captures the post's reply; a failed curl's partial body is dropped, spooled and answered `{}`. */
export function wrapPosixClaudeDecisionPost(postLines: readonly string[]): string[] {
  return [
    ...postLines.map((line, index) =>
      index === 0
        ? `dolphin_hook_reply=$(${line}`
        : index === postLines.length - 1
          ? `${line} 2>/dev/null) || { dolphin_hook_reply=; spool_hook_event; }`
          : line
    ),
    // Only a decision for the event that asked is printed; anything else stays `{}`.
    'case "$dolphin_hook_decides:$dolphin_hook_reply" in',
    `  ${CLAUDE_PRE_TOOL_USE_DECISION}:'{"hookSpecificOutput":{"hookEventName":"PreToolUse"'*'}}') dolphin_hook_answer=$dolphin_hook_reply ;;`,
    `  ${CLAUDE_PERMISSION_REQUEST_DECISION}:'{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"'*'}}}') dolphin_hook_answer=$dolphin_hook_reply ;;`,
    `  ${DOLPHIN_PROJECT_CONTEXT_DECISION}:'{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":'*'}}') dolphin_hook_answer=$dolphin_hook_reply ;;`,
    `  ${DOLPHIN_PROJECT_CONTEXT_DECISION}:'{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":'*'}}') dolphin_hook_answer=$dolphin_hook_reply ;;`,
    'esac'
  ]
}
