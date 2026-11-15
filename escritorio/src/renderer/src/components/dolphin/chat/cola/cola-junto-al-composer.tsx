import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import type { NativeChatComposerProps } from '../../../native-chat/composer/native-chat-composer-types'
import { ColaDelChat } from './ColaDelChat'
import { claveDeCola, pausarCola } from './cola-del-chat-store'

/**
 * Sólo el composer del chat sobre el CLI tiene cola de Dolphin: el estructurado ya tiene la suya
 * en el host, y un lanzador o la edición de un mensaje no encolan nada.
 */
export function composerConCola(props: NativeChatComposerProps): boolean {
  return !props.structuredTransport && !props.editSession && !props.launchPrompt
}

/**
 * La cola, arriba del composer. Vive al lado del composer y no en la vista del chat: así la vista
 * de la base no cambia, y la cola se oculta con el composer cuando el agente pregunta algo.
 */
export function ColaJuntoAlComposer({
  composer
}: {
  composer: NativeChatComposerProps
}): React.JSX.Element | null {
  const { paneKey, agent, isWorking = false, inputOwnedByCard, targetPtyId, canSend } = composer
  // Con el agente esperando una respuesta (un permiso, una pregunta en la terminal), lo que se
  // escriba en el CLI se tomaría como respuesta: la cola no avanza.
  const esperaRespuesta = useAppStore((s) => {
    const estado = s.agentStatusByPaneKey[paneKey]?.state
    return estado === 'waiting' || estado === 'blocked'
  })
  if (!composerConCola(composer)) {
    return null
  }
  const puedeRecibir =
    !isWorking &&
    !esperaRespuesta &&
    inputOwnedByCard !== true &&
    targetPtyId !== null &&
    canSend !== false
  return (
    <ColaDelChat
      paneKey={paneKey}
      agent={agent}
      trabajando={isWorking}
      puedeRecibir={puedeRecibir}
    />
  )
}

/**
 * Las props del composer con un Stop que además pausa la cola: después de frenar al agente, lo
 * que estaba esperando no sale solo, espera a que la persona diga (Reanudar o Enviar ahora).
 */
export function useComposerConPausaAlDetener(
  props: NativeChatComposerProps
): NativeChatComposerProps {
  const { onStop, paneKey, agent } = props
  const conCola = composerConCola(props)
  const onStopRef = useRef(onStop)
  useEffect(() => {
    onStopRef.current = onStop
  })
  // Estable: el Stop de la base es un callback memorizado y el composer lo usa en sus dependencias.
  const detener = useCallback(() => {
    pausarCola(claveDeCola(paneKey, agent), 'detenido')
    onStopRef.current?.()
  }, [paneKey, agent])
  const tieneStop = onStop !== undefined
  return useMemo(
    () => (conCola && tieneStop ? { ...props, onStop: detener } : props),
    [props, conCola, tieneStop, detener]
  )
}
