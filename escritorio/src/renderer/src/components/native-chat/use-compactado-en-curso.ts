import { useMemo } from 'react'
import { useNow } from '@/hooks/use-now'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { NativeChatCommandMarker } from './session/terminal/delivery/native-chat-command-marker'
import { compactadoSinMarca, compactadoVencido } from './compactado-en-curso'

/**
 * El compactado que está pasando, listo para dibujar, o `null`.
 *
 * Why el reloj se enciende en dos pasos: el candidato sale sin mirar la hora, así que mientras no
 * haya ningún `/compact` esperando su marca este hook no suscribe ningún tictac. Recién cuando hay
 * uno pide el reloj compartido de un segundo —que además se apaga con la ventana oculta—, y con él
 * aplica el tope. Pedirlo siempre dejaría un intervalo por cada panel de chat abierto para no
 * mostrar nada el 99 % del tiempo.
 */
export function useCompactadoEnCurso(args: {
  readonly markers?: readonly NativeChatCommandMarker[]
  readonly messages: readonly NativeChatMessage[]
}): { readonly desde: number } | null {
  const { markers, messages } = args
  const candidato = useMemo(() => compactadoSinMarca({ markers, messages }), [markers, messages])
  const ahora = useNow(1_000, candidato !== null)
  return candidato !== null && !compactadoVencido(candidato.desde, ahora) ? candidato : null
}
