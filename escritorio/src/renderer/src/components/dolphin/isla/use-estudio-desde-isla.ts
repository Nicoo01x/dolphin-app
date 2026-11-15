import { useEffect } from 'react'
import type { EstudioDeIsla } from '../../../../../shared/dolphin-isla-types'
import { useAppStore } from '../../../store'
import { agentesDeEstudio, registrarEstudio, yaRegistrado } from '../studio/studio-estudio'
import { summarizeStudioSession } from '../studio/studio-summary'

// Why un tope: una sesión larga se lee de atrás para adelante; los archivos que importan en
// la isla son los últimos, y leer el transcript entero de cada agente demoraría la respuesta.
const MENSAJES_A_LEER = 200

/**
 * Un agente cuyo chat nunca se abrió en esta ventana no tiene sus archivos registrados (al
 * arrancar la app no hay ninguno montado). Se leen de su transcript, con la sesión que
 * reportó su hook, para que la isla no diga «vacío» justo después de reiniciar.
 */
async function leerLosQueFaltan(paneKeys: readonly string[]): Promise<void> {
  const estados = useAppStore.getState().agentStatusByPaneKey
  await Promise.all(
    paneKeys
      .filter((paneKey) => !yaRegistrado(paneKey))
      .map(async (paneKey) => {
        const estado = estados[paneKey]
        const sesion = estado?.providerSession
        if (!estado?.agentType || !sesion?.id) {
          return
        }
        const leido = await window.api.nativeChat
          .readSession(estado.agentType, sesion.id, MENSAJES_A_LEER, sesion.transcriptPath)
          .catch(() => null)
        if (leido && 'messages' in leido) {
          registrarEstudio(paneKey, summarizeStudioSession(leido.messages))
        }
      })
  )
}

export function useEstudioDesdeIsla(): void {
  useEffect(() => {
    return window.api.dolphin?.onPedirEstudio?.(({ id, paneKeys }) => {
      void leerLosQueFaltan(paneKeys).then(() => {
        const agentes: EstudioDeIsla['agentes'] = agentesDeEstudio(paneKeys)
        void window.api.dolphin.confirmarEstudioDesdeIsla?.({
          id,
          estudio: { disponible: true, agentes }
        })
      })
    })
  }, [])
}
