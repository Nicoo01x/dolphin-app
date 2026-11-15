import { useMemo } from 'react'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { sugerenciaDeRespuesta, type SugerenciaDeRespuesta } from './sugerencia-de-respuesta'

/**
 * La sugerencia para el compositor, sacada de lo último que dijo el agente.
 *
 * El texto de un mensaje puede venir en varios bloques; acá se junta el de los de prosa y se
 * ignora lo demás (razonamiento, herramientas, imágenes): lo que define qué contestar es lo que
 * el agente te dijo a vos, no lo que hizo por dentro.
 */
export function useSugerenciaDeRespuesta(
  messages: readonly NativeChatMessage[],
  { trabajando, borrador }: { readonly trabajando: boolean; readonly borrador: string }
): SugerenciaDeRespuesta | null {
  const ultimo = useMemo(() => ultimoDelAgente(messages), [messages])
  return useMemo(
    () => sugerenciaDeRespuesta(ultimo, { trabajando, borrador }),
    [ultimo, trabajando, borrador]
  )
}

/** Lo último que dijo el agente, en texto. Nada si lo último fue tuyo: ahí no hay qué contestar. */
export function ultimoDelAgente(messages: readonly NativeChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const mensaje = messages[i]
    if (!mensaje || mensaje.role === 'reasoning' || mensaje.role === 'tool') {
      continue
    }
    // Lo último lo escribiste vos: estás en el medio de hablar, no esperando.
    if (mensaje.role !== 'assistant') {
      return null
    }
    const texto = mensaje.blocks
      .flatMap((bloque) => (bloque.type === 'text' ? [bloque.text] : []))
      .join('\n')
      .trim()
    if (texto !== '') {
      return texto
    }
  }
  return null
}
