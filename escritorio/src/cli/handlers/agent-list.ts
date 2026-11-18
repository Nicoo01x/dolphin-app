// `agent list`: qué motores puede abrir Dolphin en este espacio de trabajo, antes de repartir
// tareas. Usa la misma detección que el selector de agentes de la app (`preflight.detectAgents`).

import type { TuiAgent } from '../../shared/agent-launch/catalog/tui-agent'
import { tuiAgentDisplayName } from '../../shared/agent-launch/catalog/tui-agent-display-names'
import { CLI_AGENT_ALIASES } from '../agent-launch-request'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import type { RuntimeClient } from '../runtime-client'
import { resolveCurrentWorktreeSelection } from '../selectors'

export type AgentListEntry = {
  id: TuiAgent
  name: string
  /** Otros nombres que `--agent` acepta para este motor (chatgpt → codex). */
  aliases: string[]
}

export type AgentListResult = {
  /** Absent when no Dolphin workspace contains the current directory: the host's own list. */
  worktreeId?: string
  agents: AgentListEntry[]
}

export type AgentListDeps = {
  /** The workspace that contains the cwd, or null when there is none. */
  currentWorktreeId: (cwd: string, client: RuntimeClient) => Promise<string | null>
}

const DEFAULT_DEPS: AgentListDeps = {
  currentWorktreeId: async (cwd, client) => {
    if (client.isRemote) {
      // El cwd del cliente no nombra un espacio del servidor: se pregunta por el host entero.
      return null
    }
    try {
      return (await resolveCurrentWorktreeSelection(cwd, client)).worktreeId
    } catch {
      return null
    }
  }
}

function aliasesOf(agent: TuiAgent): string[] {
  return Object.entries(CLI_AGENT_ALIASES)
    .filter(([, target]) => target === agent)
    .map(([alias]) => alias)
}

export function toAgentListEntries(agents: readonly TuiAgent[]): AgentListEntry[] {
  return agents.map((id) => ({ id, name: tuiAgentDisplayName(id) ?? id, aliases: aliasesOf(id) }))
}

export function formatAgentList(result: AgentListResult): string {
  if (result.agents.length === 0) {
    return 'No agent CLI was found on this host. Install one (claude, codex, gemini…) and retry.'
  }
  const rows = result.agents.map((agent) => {
    const aliases = agent.aliases.length > 0 ? ` (also: ${agent.aliases.join(', ')})` : ''
    return `${agent.id}\t${agent.name}${aliases}`
  })
  return [
    ...rows,
    'Found on this host. Being found does not prove the agent is signed in: its tab says so.'
  ].join('\n')
}

export function createAgentListHandler(deps: AgentListDeps = DEFAULT_DEPS): CommandHandler {
  return async ({ client, cwd, json }) => {
    const worktreeId = await deps.currentWorktreeId(cwd, client)
    const detected = await client.call<TuiAgent[]>(
      'preflight.detectAgents',
      worktreeId ? { worktreeId } : {}
    )
    printResult(
      {
        ...detected,
        result: {
          ...(worktreeId ? { worktreeId } : {}),
          agents: toAgentListEntries(detected.result)
        }
      },
      json,
      formatAgentList
    )
  }
}

export const agentListHandler: CommandHandler = createAgentListHandler()
