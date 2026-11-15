// `agent delegate`: abrir otro motor como chat en este worktree, esperarlo y traer su respuesta,
// en una sola llamada. Compone `agent launch --surface chat` y la espera de `chat wait`; no hay RPC nueva.

import type { AgentLaunchResult } from '../../shared/agent-launch/contracts/agent-launch-intent'
import type { TuiAgent } from '../../shared/agent-launch/catalog/tui-agent'
import { isUnattachedAgentSessionReadRefusal } from '../../shared/agent-session/failures/structured-agent-session-read-refusal'
import {
  callAgentLaunch,
  getAgentLaunchCapabilities,
  parseCliAgent,
  readCliAgentLaunch
} from '../agent-launch-request'
import {
  formatSettled,
  readHistory,
  readSettledTurn,
  readTranscript,
  requireWorkingFlag,
  waitForChat,
  type ChatSettled,
  type ChatTranscript
} from '../chat-history'
import type { ChatTranscriptEntry } from '../chat-sessions'
import { readTextOrFileFlag } from '../command-body-input'
import type { CommandHandler } from '../dispatch'
import { getOptionalPositiveIntegerFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import type { RuntimeClient, RuntimeRpcSuccess } from '../runtime-client'
import { RuntimeClientError } from '../runtime-client'
import { getRequiredWorktreeSelector, resolveCurrentWorktreeSelector } from '../selectors'

type Flags = Map<string, string | boolean>

const POLL_MS = 1000
/** Lo que se espera a que el turno delegado arranque antes de dejar que mande `chat wait`. */
export const DELEGATE_START_GRACE_MS = 60_000

/** Seams para probar la secuencia sin un runtime ni un motor real. */
export type AgentDelegateDeps = {
  getCapabilities: typeof getAgentLaunchCapabilities
  launch: typeof callAgentLaunch
  readHistory: typeof readHistory
  readTranscript: typeof readTranscript
  waitForChat: typeof waitForChat
  readSettledTurn: typeof readSettledTurn
  resolveWorktree: (
    flags: Flags,
    cwd: string,
    client: RuntimeClient,
    agent: TuiAgent
  ) => Promise<string>
  sleep: (ms: number) => Promise<void>
  now: () => number
}

export type AgentDelegateResult = {
  agent: string
  worktreeId: string
  handle: string
  /** Absent when Dolphin could not open the agent as a chat. */
  session?: string
  surface: 'chat' | 'terminal'
  /** How the brief arrived (`journaled` when the chat has it). */
  prompt: string
  why: string
  /** Absent without --wait: the chat is running and the caller reads it later. */
  settled?: ChatSettled
  /** The delegated agent's last message in its turn; null when it wrote none. */
  reply?: string | null
  entries?: ChatTranscriptEntry[]
  cursor?: ChatTranscript['cursor']
  truncated?: boolean
}

const DEFAULT_DEPS: AgentDelegateDeps = {
  getCapabilities: getAgentLaunchCapabilities,
  launch: callAgentLaunch,
  readHistory,
  readTranscript,
  waitForChat,
  readSettledTurn,
  resolveWorktree: async (flags, cwd, client, agent) => {
    const selector = flags.get('worktree')
    const current = selector === undefined || selector === 'active' || selector === 'current'
    return current
      ? resolveCurrentWorktreeSelector(cwd, client, { agent })
      : getRequiredWorktreeSelector(flags, 'worktree', cwd, client)
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now()
}

/** El último mensaje del agente en el turno: es lo que el líder tiene que leer. */
export function delegatedReply(entries: readonly ChatTranscriptEntry[]): string | null {
  const last = entries.findLast((entry) => entry.kind === 'message' && entry.role !== 'user')
  return last && last.kind === 'message' ? last.text : null
}

/**
 * El prompt se publica en el chat antes de que el turno arranque, y en ese hueco el chat no está
 * trabajando: `chat wait` lo daría por terminado sin respuesta. Esperamos a ver el turno en marcha,
 * una pregunta, o una respuesta ya escrita después del mensaje.
 */
async function waitForTurnStart(
  client: RuntimeClient,
  session: string,
  deadline: number,
  deps: AgentDelegateDeps
): Promise<void> {
  for (;;) {
    try {
      const { page } = (await deps.readHistory(client, session, 1)).result
      requireWorkingFlag(page)
      if (
        page.working === true ||
        (page.actionablePromptIds?.length ?? 0) > 0 ||
        (page.nextQueuedMessageId ?? null) !== null
      ) {
        return
      }
      const { entries } = (await deps.readTranscript(client, session)).result
      const lastUser = entries.findLastIndex((e) => e.kind === 'message' && e.role === 'user')
      if (lastUser !== -1 && lastUser < entries.length - 1) {
        return
      }
    } catch (error) {
      // Un chat recién abierto puede no estar enganchado todavía; cualquier otro error es real.
      if (!isUnattachedAgentSessionReadRefusal(error) || deps.now() >= deadline) {
        throw error
      }
    }
    if (deps.now() >= deadline) {
      return
    }
    await deps.sleep(POLL_MS)
  }
}

async function readPrompt(flags: Flags, cwd: string): Promise<string> {
  const prompt = (await readTextOrFileFlag(flags, cwd, 'prompt', true)) ?? ''
  if (prompt.trim().length === 0) {
    throw new RuntimeClientError(
      'invalid_argument',
      'The task for the other agent must not be empty.'
    )
  }
  return prompt
}

function launchedSummary(agent: string, launched: AgentLaunchResult): AgentDelegateResult {
  const { outcome } = launched
  return {
    agent,
    worktreeId: launched.worktreeId,
    handle: outcome.handle,
    ...(outcome.kind === 'structured' ? { session: outcome.sessionId } : {}),
    surface: outcome.kind === 'structured' ? 'chat' : 'terminal',
    prompt: launched.prompt?.outcome ?? 'not-delivered',
    why: launched.receipt.detail
  }
}

export function formatAgentDelegate(result: AgentDelegateResult): string {
  const head = [
    `${result.agent} is running as a ${result.surface} (${result.handle}).`,
    ...(result.session ? [`session: ${result.session}`] : []),
    `why: ${result.why}`
  ]
  if (result.surface === 'terminal') {
    return [
      ...head,
      `There is no chat to wait on. Read it with: dolphin terminal read --terminal ${result.handle}`
    ].join('\n')
  }
  if (result.settled === undefined) {
    return [
      ...head,
      `Not waiting. Later: dolphin chat wait --session ${result.session} --timeout-ms 600000`
    ].join('\n')
  }
  return [
    ...head,
    formatSettled({
      session: result.session ?? '',
      entries: result.entries ?? [],
      cursor: result.cursor ?? null,
      truncated: result.truncated ?? false,
      settled: result.settled
    })
  ].join('\n')
}

export function createAgentDelegateHandler(deps: AgentDelegateDeps = DEFAULT_DEPS): CommandHandler {
  return async ({ flags, client, cwd, json, rawArgs }) => {
    const agent = parseCliAgent(getRequiredStringFlag(flags, 'agent'))
    if (client.isRemote) {
      throw new RuntimeClientError(
        'runtime_unsupported',
        'Delegating needs to read and wait on the chat, which a paired host does not support yet. Run this on the host machine.'
      )
    }
    const prompt = await readPrompt(flags, cwd)
    const launchFlags: Flags = new Map(flags)
    launchFlags.delete('prompt-file')
    launchFlags.set('prompt', prompt)
    launchFlags.set('surface', 'chat')
    const launch = readCliAgentLaunch(launchFlags, agent, { createsWorktree: false })
    const wait = flags.has('wait')
    const timeoutMs = getOptionalPositiveIntegerFlag(flags, 'timeout-ms')
    const worktree = await deps.resolveWorktree(flags, cwd, client, agent)
    const capabilities = await deps.getCapabilities(client)
    if (!capabilities) {
      throw new RuntimeClientError(
        'incompatible_runtime',
        'This Dolphin host cannot start agents from the CLI. Update Dolphin on the execution host.'
      )
    }
    const startedAt = deps.now()
    const launched = await deps.launch(
      client,
      launch,
      {
        target: { kind: 'existing', worktree },
        presentation: flags.get('focus') === true ? 'focused' : 'background'
      },
      capabilities,
      rawArgs
    )
    const summary = launchedSummary(agent, launched.result)
    const reply = (result: AgentDelegateResult): RuntimeRpcSuccess<AgentDelegateResult> => ({
      ...launched,
      result
    })
    // Started but not as a chat, or the brief did not arrive: say so and fail, with the handle.
    if (summary.surface === 'terminal' || summary.prompt !== 'journaled' || !summary.session) {
      process.exitCode = 1
      printResult(reply(summary), json, formatAgentDelegate)
      return
    }
    if (!wait) {
      printResult(reply(summary), json, formatAgentDelegate)
      return
    }
    const deadline = timeoutMs === undefined ? Infinity : startedAt + timeoutMs
    await waitForTurnStart(
      client,
      summary.session,
      Math.min(deadline, deps.now() + DELEGATE_START_GRACE_MS),
      deps
    )
    const remaining = timeoutMs === undefined ? undefined : Math.max(1, deadline - deps.now())
    const settled = await deps.waitForChat(client, summary.session, remaining)
    const turn = (await deps.readSettledTurn(client, summary.session, settled)).result
    if (settled === 'blocked') {
      // El otro agente pide permiso: sólo la persona lo aprueba, y el líder tiene que decírselo.
      process.exitCode = 1
    }
    printResult(
      reply({
        ...summary,
        settled,
        reply: delegatedReply(turn.entries),
        entries: turn.entries,
        cursor: turn.cursor,
        truncated: turn.truncated
      }),
      json,
      formatAgentDelegate
    )
  }
}

export const agentDelegateHandler: CommandHandler = createAgentDelegateHandler()
