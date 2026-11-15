import { contextTokensFromUsage } from '../../../../../shared/agent-session/agent-session-context-usage'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
type ClaudeCostTokens = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

// Why: AgentSessionTokenUsage no decodifica la ventana de caché de 1 h; no la mandamos como si fuera conocida.
export type UsoDelChatModelo = { model: string | null; tokens: ClaudeCostTokens }

/** El modelo de la última respuesta y lo que leyó para darla (lo que llena la ventana). */
export type UsoDelChat = {
  model: string | null
  contextTokens: number | null
  billableByModel: UsoDelChatModelo[] | null
}

/**
 * Sale de la conversación misma: cada respuesta del agente anota con qué modelo salió y cuánto
 * leyó. Se mira la última que lo dice; el CLI no siempre muestra el modelo en su pantalla.
 */
export function usoDelChat(messages: readonly NativeChatMessage[]): UsoDelChat {
  let model: string | null = null
  let contextTokens: number | null = null
  let lastKnownModel: string | null = null
  const usageByMessageId = new Map<
    string,
    { model: string | null; usage: NonNullable<NativeChatMessage['usage']> }
  >()
  for (const message of messages) {
    if (message?.role !== 'assistant') {
      continue
    }
    if (message.model) {
      lastKnownModel = message.model
    }
    if (message.model) {
      model = message.model
    }
    if (message.usage) {
      contextTokens = contextTokensFromUsage(message.usage)
    }
    if (message.usage) {
      // Why usageId: las filas de una misma respuesta tienen ids distintos y repiten el uso.
      const clave = message.usageId ?? message.id
      const previous = usageByMessageId.get(clave)
      const responseModel = message.model ?? lastKnownModel
      if (!previous) {
        usageByMessageId.set(clave, { model: responseModel, usage: message.usage })
      } else {
        usageByMessageId.set(clave, {
          model: previous.model ?? responseModel,
          usage: {
            inputTokens: Math.max(previous.usage.inputTokens, message.usage.inputTokens),
            outputTokens: Math.max(previous.usage.outputTokens, message.usage.outputTokens),
            cacheReadInputTokens: Math.max(
              previous.usage.cacheReadInputTokens,
              message.usage.cacheReadInputTokens
            ),
            cacheCreationInputTokens: Math.max(
              previous.usage.cacheCreationInputTokens,
              message.usage.cacheCreationInputTokens
            )
          }
        })
      }
    }
  }
  const grouped = new Map<string | null, ClaudeCostTokens>()
  for (const { model: usageModel, usage } of usageByMessageId.values()) {
    const tokens = grouped.get(usageModel) ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0
    }
    tokens.inputTokens += usage.inputTokens
    tokens.outputTokens += usage.outputTokens
    tokens.cacheReadTokens += usage.cacheReadInputTokens
    tokens.cacheWriteTokens += usage.cacheCreationInputTokens
    grouped.set(usageModel, tokens)
  }
  const hasUsage = usageByMessageId.size > 0
  return {
    model,
    contextTokens,
    billableByModel: hasUsage
      ? [...grouped].map(([groupModel, tokens]) => ({ model: groupModel, tokens }))
      : null
  }
}

/** «claude-opus-5-5» → «Opus 5.5»; un id que no sigue esa forma queda como vino. */
export function nombreDelModelo(id: string): string {
  // La versión menor es de uno o dos dígitos: los ocho de una fecha («-20250514») no lo son.
  const nuevo = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i)
  // Los de antes ponían la versión primero: claude-3-5-sonnet-20241022.
  const viejo = id.match(/^claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)(?:-\d{8})?$/i)
  const [familia, mayor, menor] = nuevo
    ? [nuevo[1], nuevo[2], nuevo[3]]
    : viejo
      ? [viejo[3], viejo[1], viejo[2]]
      : []
  if (!familia || !mayor) {
    return id
  }
  return `${familia.charAt(0).toUpperCase()}${familia.slice(1)} ${mayor}${menor ? `.${menor}` : ''}`
}

/** 812 → «812», 45_210 → «45k», 1_250_000 → «1,3M» (con la coma o el punto del idioma). */
export function tokensCortos(tokens: number, locale?: string): string {
  if (tokens < 1000) {
    return String(tokens)
  }
  // Desde 999 500 redondea a mil: eso es «1M», no «1000k».
  if (tokens < 999_500) {
    return `${Math.round(tokens / 1000)}k`
  }
  return `${(tokens / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })}M`
}
