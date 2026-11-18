import { CheckpointsDelChat } from '../../CheckpointsDelChat'
import type { NativeChatComposerControl } from './NativeChatComposerToolbar'

/**
 * Los controles que Dolphin suma a la barra izquierda del composer de la base: los checkpoints.
 *
 * Why sin «Delegar» ni «Orquestación»: Nico sacó «Delegar» el 15/11/2026 y «Orquestación» el
 * 17/11/2026 («el botón de orquestación lo saquemos, pero con la condición que yo en un chat de
 * Claude le pueda decir "delegá las tareas"»). Se fueron los botones, no la función: repartir el
 * trabajo se pide escribiendo, y la skill `dolphin-delegar` (viene con la app) le enseña al agente
 * a abrir cada compañero como pestaña de Dolphin con `dolphin orchestration worker-start`. La
 * delegación automática sigue en Ajustes › Experimental.
 *
 * Why aparte: la barra de la base los recibe con un spread, en el mismo lugar donde estaban.
 */
export function controlesDolphinDelComposer({
  terminalTabId
}: {
  terminalTabId: string | undefined
}): NativeChatComposerControl[] {
  // Volver el código a como estaba antes de un pedido. Sale solo si hay algo que ofrecer.
  return terminalTabId
    ? [{ id: 'checkpoints', priority: 3, content: <CheckpointsDelChat tabId={terminalTabId} /> }]
    : []
}
