import { toast } from 'sonner'
import type { Translate } from '@/i18n/use-translate'
import { delegarConDolphin } from '@/lib/delegar-con-dolphin'
import { formatAgentTypeLabel } from '../../../../../../shared/agent-status/presentation/agent-type-label'
import { cartelesDeFuncionDe } from '../../../../../../shared/carteles-de-funcion'
import { isTuiAgent } from '../../../../../../shared/agent-launch/catalog/tui-agent-config'
import { IntelligentOrchestration } from '../../../dolphin/chat/IntelligentOrchestration'
import { CartelDeFuncion } from '../../CartelDeFuncion'
import { CheckpointsDelChat } from '../../CheckpointsDelChat'
import type { NativeChatComposerControl } from './NativeChatComposerToolbar'

/**
 * Los controles que Dolphin suma a la barra izquierda del composer de la base: checkpoints, los
 * carteles de lo que Dolphin sabe hacer con este motor y la orquestación inteligente.
 *
 * Why aparte: la barra de la base los recibe con un spread, en el mismo lugar donde estaban.
 */
export function controlesDolphinDelComposer({
  terminalTabId,
  agent,
  isWorking,
  t
}: {
  terminalTabId: string | undefined
  agent: string | undefined
  isWorking: boolean
  t: Translate
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
    // Lo que Dolphin sabe hacer con este motor, contado con un video y elegido ahí mismo.
    ...cartelesDeFuncionDe(agent).map((cartel) => ({
      id: `cartel:${cartel.id}`,
      priority: 3,
      content: (
        <CartelDeFuncion
          cartel={cartel}
          nombreDelMotor={formatAgentTypeLabel(agent)}
          deshabilitado={isWorking}
          onElegir={(valor) => {
            if (!delegarConDolphin(cartel, valor)) {
              toast.error(
                t(
                  'auto.components.native-chat.NativeChatComposerActions.delegationFailed',
                  'Could not open Dolphin to delegate.'
                )
              )
            }
          }}
        />
      )
    })),
    // Why pegado a «Delegar»: los dos son «cuánto reparte Dolphin solo». Va con la misma
    // condición que tenía en la barra de arriba: sólo en el chat de un agente de terminal.
    // Reusa `agent`, que ya viaja por props para el cartel.
    ...(isTuiAgent(agent)
      ? [{ id: 'orquestacion', priority: 3, content: <IntelligentOrchestration /> }]
      : [])
  ]
}
