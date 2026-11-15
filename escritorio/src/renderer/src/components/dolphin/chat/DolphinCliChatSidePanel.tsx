import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import type { NativeChatContextUsageSummary } from '../../../../../shared/native-chat/native-chat-context-usage-summary'
import { useNativeChatTabOwnerWorktreeId } from '../../native-chat/pane/ownership/use-native-chat-tab-owner'
import { NativeChatAgentWatermark } from '../../native-chat/NativeChatAgentWatermark'
import { usoDelChat } from './uso-del-chat'
import { VentanaDeDelegacion, type DatosDeDelegacion } from './VentanaDeDelegacion'
import { TiraDeCompaneros } from './TiraDeCompaneros'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'

/** La ventana de contexto que se le supone al modelo: 1M si su id lo dice, si no 200k. */
export function ventanaDeContexto(model: string | null): number {
  return model && /\[1m\]|-1m\b/i.test(model) ? 1_000_000 : 200_000
}

/** El contexto del chat sobre el CLI, leído de la conversación (estimado: el CLI no da la ventana). */
export function contextoDelChatCli(
  messages: readonly NativeChatMessage[]
): NativeChatContextUsageSummary | null {
  const uso = usoDelChat(messages)
  if (uso.contextTokens === null) {
    return null
  }
  const windowTokens = ventanaDeContexto(uso.model)
  return {
    usedTokens: uso.contextTokens,
    windowTokens,
    percentage: Math.min(100, Math.round((uso.contextTokens / windowTokens) * 100)),
    estimated: true,
    rows: []
  }
}

/**
 * Lo que envuelve a la conversación de un chat sobre el CLI.
 *
 * Why ya no devuelve un panel: hasta el 08/11/2026 a la derecha del chat vivía el panel de la
 * sesión (entorno, conectores, lo que fue pasando, contexto) con su interruptor en la barra. Nico
 * lo sacó entero —es la misma información que el estudio y la isla ya muestran donde se la busca,
 * y en un panel angosto se comía la mitad del ancho de la conversación—.
 */
export function useDolphinCliChatSidePanel(
  tabId: string,
  messages: readonly NativeChatMessage[],
  agentWorking = false
): {
  /** Lo que flota encima de la conversación: la ventana que propone delegar. */
  columnas: { delegacion: DatosDeDelegacion }
} {
  const worktreeId = useNativeChatTabOwnerWorktreeId(tabId)
  return { columnas: { delegacion: { messages, trabajando: agentWorking, worktreeId } } }
}

/**
 * La conversación, con la tira de compañeros arriba y, flotando encima, la ventana que propone
 * delegar el plan en compañeros cuando el líder termina de pensar.
 */
export function DolphinChatColumns({
  agent,
  delegacion,
  children
}: {
  agent?: AgentType
  /** Lo que la ventana de delegación lee del chat; sin esto no se ofrece. */
  delegacion?: DatosDeDelegacion
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {agent ? <NativeChatAgentWatermark agent={agent} /> : null}
        {/* Arriba de la conversación y fuera de ella: la tira queda quieta mientras el chat
            scrollea, que es lo que la vuelve un lugar al que volver. */}
        {agent ? (
          <div className="relative z-10">
            <TiraDeCompaneros worktreeId={delegacion?.worktreeId ?? null} agente={agent} />
          </div>
        ) : null}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
        {agent && delegacion ? <VentanaDeDelegacion agente={agent} {...delegacion} /> : null}
      </div>
    </div>
  )
}
