import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { sugerenciaDeRespuesta } from './sugerencia-de-respuesta'
import { ultimoDelAgente } from './use-sugerencia-de-respuesta'

/**
 * Lo que conviene contestarle al agente, para el campo vacío del compositor: Tab lo escribe.
 *
 * Es la composición de las dos piezas que ya existían —el último mensaje del agente y qué sugerir
 * sobre él—, con nombre y en un solo lugar. Estaba armada a mano adentro del compositor, que es el
 * archivo más grande del chat y ya estaba en su techo de líneas.
 */
export function sugerenciaParaElCampo(
  mensajes: readonly NativeChatMessage[] | undefined,
  trabajando: boolean,
  borrador: string
): ReturnType<typeof sugerenciaDeRespuesta> {
  return sugerenciaDeRespuesta(ultimoDelAgente(mensajes ?? []), { trabajando, borrador })
}
