import { useCallback, useEffect, useRef } from 'react'
import { useColaDelComposerDolphin } from '../composer-dolphin'
import { registrarEntrega, retenerEnCola } from './cola-del-chat-store'

/** El reenvío que el envío al CLI de la base ya sabe hacer, marcado como salido de la cola. */
type EnvioAlCli = (retry: { text: string; imagePaths?: string[]; fromQueue: true }) => boolean

/**
 * Lo que el envío al CLI le pregunta a la cola antes de escribir: true si el mensaje quedó
 * esperando en Dolphin y no hay que escribirlo todavía.
 */
export function useRetenerEnLaCola(): (texto: string, imagenes: readonly string[]) => boolean {
  const cola = useColaDelComposerDolphin()
  return useCallback(
    (texto, imagenes) =>
      cola !== null &&
      retenerEnCola(cola.clave, { texto, imagenes: [...imagenes] }, cola.trabajando),
    [cola]
  )
}

/**
 * Le deja a la cola la forma de escribir un mensaje en el CLI: el mismo camino que un envío del
 * composer (burbuja, checkpoint, verificación de la escritura), sin tocar el borrador.
 */
export function useEntregaDeLaCola(enviar: EnvioAlCli): void {
  const clave = useColaDelComposerDolphin()?.clave ?? null
  // Why un ref: la base arma su envío de nuevo en cada render, y registrarlo cada vez sería ruido.
  const enviarRef = useRef(enviar)
  useEffect(() => {
    enviarRef.current = enviar
  })
  useEffect(() => {
    if (clave === null) {
      return
    }
    return registrarEntrega(clave, (mensaje) =>
      enviarRef.current({
        text: mensaje.texto,
        ...(mensaje.imagenes.length > 0 ? { imagePaths: [...mensaje.imagenes] } : {}),
        fromQueue: true
      })
    )
  }, [clave])
}
