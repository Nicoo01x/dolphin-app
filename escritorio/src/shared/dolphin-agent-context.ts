/**
 * El aviso «estás corriendo dentro de Dolphin» que reciben los agentes que Dolphin lanza.
 *
 * Una sola fuente para los tres canales: el system prompt del chat de Claude, las
 * developer instructions del hilo de Codex y el SessionStart de Claude y Gemini en terminal.
 * Va en inglés y escrito a mano porque los modelos lo siguen mejor así; las guías de las skills
 * siguen en castellano. Sin él, «delegá a ChatGPT» terminaba en un plugin que corre Codex
 * fuera de Dolphin, y la persona no veía el segundo chat.
 *
 * Why sólo ASCII en el texto: este módulo entra al bundle de dolphind, que rechaza cualquier
 * byte no-ASCII (config/scripts/dolphind-entry-build.mjs).
 */

export type DolphinAgentContextSettings = {
  /** Tell the agents Dolphin launches that they run inside Dolphin and how to delegate. */
  agentDolphinContextEnabled: boolean
}

export const DOLPHIN_AGENT_CONTEXT = [
  'You are running inside Dolphin, a desktop app where the user works with several coding agents side by side.',
  'Dolphin\'s CLI is the executable in the DOLPHIN_CLI_COMMAND environment variable ("$DOLPHIN_CLI_COMMAND" in POSIX shells, & $env:DOLPHIN_CLI_COMMAND in PowerShell). Use it instead of a bare `dolphin`, which can be a different program; below it is written as <dolphin>.',
  'To delegate work to another agent (Codex, which the user may call ChatGPT, GPT or OpenAI; Gemini; Claude), go through Dolphin so the user sees both chats:',
  '- `<dolphin> agent delegate --agent codex --prompt "<task>" --wait --json` opens it as a chat in this workspace and returns its reply. "blocked" means it is waiting for the user to approve something: tell the user instead of waiting.',
  '- Or `<dolphin> agent launch --agent codex --surface chat --prompt "<task>" --json`, then `<dolphin> chat wait --session <session> --timeout-ms 600000 --json` and `<dolphin> chat read --session <session> --json`.',
  'Never use external plugins, skills or subagents that run those agents outside Dolphin (for example codex:rescue, codex-rescue or a headless `codex exec`).',
  'Before other Dolphin commands, load the dolphin-cli skill, or run `<dolphin> skills get dolphin-cli`.'
].join('\n')

/** On unless the user turned it off; a profile saved before the setting existed gets it too. */
export function dolphinAgentContextEnabled(
  settings: Partial<DolphinAgentContextSettings> | null | undefined
): boolean {
  return settings?.agentDolphinContextEnabled !== false
}

/** The text to inject for these settings, or null when the user turned the notice off. */
export function dolphinAgentContextFor(
  settings: Partial<DolphinAgentContextSettings> | null | undefined
): string | null {
  return dolphinAgentContextEnabled(settings) ? DOLPHIN_AGENT_CONTEXT : null
}

/** The host-side switch a runtime reads each time a chat starts, so turning it off applies to the next one. */
export function dolphinAgentContextHostDeps(
  readSettings: () => Partial<DolphinAgentContextSettings> | null | undefined
): { isEnabled: () => boolean } {
  return { isEnabled: () => dolphinAgentContextEnabled(readSettings()) }
}
