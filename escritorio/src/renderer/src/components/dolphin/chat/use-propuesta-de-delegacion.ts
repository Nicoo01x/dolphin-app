import { useCallback, useMemo, useState } from 'react'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { ultimoDelAgente } from './use-sugerencia-de-respuesta'
import {
  firmaDeLaPropuesta,
  propuestaDeDelegacion,
  type PropuestaDeDelegacion
} from './propuesta-de-delegacion'

/**
 * La propuesta de delegar de este chat, y el «no, gracias».
 *
 * Lo descartado se recuerda por la firma de la propuesta y no por el id del mensaje: el mensaje del
 * líder llega en vivo y su id cambia mientras llega, así que con el id la ventana volvía sola en
 * cuanto entraba otro trozo de texto.
 *
 * Why además un corte por turno: la firma es el TEXTO de las tareas, y mientras el líder sigue
 * escribiendo ese texto crece. La firma que se descartó deja de coincidir con la de un segundo
 * después, así que la ventana se cerraba y volvía sola — con los trabajos ya repartidos, la X no
 * cerraba nada. Cerrarla ahora vale para todo lo que diga ese mismo turno; vuelve a aparecer
 * cuando el agente arranca un mensaje nuevo, que es cuando hay algo nuevo que proponer.
 */
export function usePropuestaDeDelegacion(
  messages: readonly NativeChatMessage[],
  { trabajando }: { readonly trabajando: boolean }
): { propuesta: PropuestaDeDelegacion | null; descartar: () => void } {
  const [descartadas, setDescartadas] = useState<ReadonlySet<string>>(() => new Set<string>())
  const [cerradaEnTurno, setCerradaEnTurno] = useState<number | null>(null)
  const ultimo = useMemo(() => ultimoDelAgente(messages), [messages])
  // El turno: cuántos mensajes lleva dichos el agente. Mientras uno se escribe no cambia.
  const turno = useMemo(
    () => messages.reduce((cuenta, m) => (m.role === 'assistant' ? cuenta + 1 : cuenta), 0),
    [messages]
  )
  const propuesta = useMemo(
    () => propuestaDeDelegacion(ultimo, { trabajando }),
    [ultimo, trabajando]
  )
  const firma = propuesta === null ? null : firmaDeLaPropuesta(propuesta)
  const descartar = useCallback(() => {
    setCerradaEnTurno(turno)
    if (firma !== null) {
      setDescartadas((previas) => new Set(previas).add(firma))
    }
  }, [firma, turno])
  const cerrada =
    (cerradaEnTurno !== null && turno <= cerradaEnTurno) ||
    (firma !== null && descartadas.has(firma))
  return {
    propuesta: cerrada ? null : propuesta,
    descartar
  }
}
