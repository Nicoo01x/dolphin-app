import { isTuiAgent } from '../../../../../../shared/agent-launch/catalog/tui-agent-config'
import { IntelligentOrchestration } from '../../../dolphin/chat/IntelligentOrchestration'
import { CheckpointsDelChat } from '../../CheckpointsDelChat'
import type { NativeChatComposerControl } from './NativeChatComposerToolbar'

/**
 * Los controles que Dolphin suma a la barra izquierda del composer de la base: checkpoints y la
 * orquestación inteligente.
 *
 * Why sin «Delegar»: Nico lo sacó del compositor el 15/11/2026 («ese botón de delegar sacalo, dejá
 * solo el de orquestación»). Se fue el botón, no la función: delegar sigue por el chat y por
 * `dolphin agent delegate`.
 *
 * Why aparte: la barra de la base los recibe con un spread, en el mismo lugar donde estaban.
 */
export function controlesDolphinDelComposer({
  terminalTabId,
  agent
}: {
  terminalTabId: string | undefined
  agent: string | undefined
}): NativeChatComposerControl[] {
  return [
    // Volver el código a como estaba antes de un pedido. Sale solo si hay algo que ofrecer.
    ...(terminalTabId
      ? [
          {
            id: 'checkpoints',
            priority: 3,
            content: <CheckpointsDelChat tabId={terminalTabId} />
          }
        ]
      : []),
    // «Cuánto reparte Dolphin solo». Va con la misma condición que tenía en la barra de arriba:
    // sólo en el chat de un agente de terminal.
    ...(isTuiAgent(agent)
      ? [{ id: 'orquestacion', priority: 3, content: <IntelligentOrchestration /> }]
      : [])
  ]
}
