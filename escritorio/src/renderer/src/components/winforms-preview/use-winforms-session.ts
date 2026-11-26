import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { WinFormsEventoDeSesion } from '../../../../shared/winforms/winforms-preview-types'
import { ESTADO_INICIAL, reducirSesion, type EstadoDeSesion } from './winforms-session-state'

type Accion =
  | { tipo: 'evento'; evento: WinFormsEventoDeSesion }
  | { tipo: 'reiniciar' }
  | { tipo: 'sin-dialogo' }

function reducir(estado: EstadoDeSesion, accion: Accion): EstadoDeSesion {
  switch (accion.tipo) {
    case 'reiniciar':
      return ESTADO_INICIAL
    case 'sin-dialogo':
      return { ...estado, dialogo: null }
    case 'evento':
      return reducirSesion(estado, accion.evento)
  }
}

/**
 * La carpeta abierta en Dolphin, a partir de la ruta absoluta y la relativa del archivo: ahí se
 * buscan copias del build cuando su proyecto no tiene una.
 */
export function raizDesdeRelativo(filePath: string, relativePath: string): string | null {
  const absoluta = filePath.replace(/\\/g, '/')
  const relativa = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '')
  if (!relativa || !absoluta.toLowerCase().endsWith(`/${relativa.toLowerCase()}`)) {
    return null
  }
  const raiz = filePath.slice(0, filePath.length - relativa.length - 1)
  return raiz.length > 2 ? raiz : null
}

let contador = 0
const nuevaSesion = (): string => `wf-${Date.now().toString(36)}-${++contador}`

/**
 * Una sesión del host por pestaña montada: arranca al verse, muere al cerrarse o al cambiar de
 * pestaña (así no queda un proceso con los .dll del build tomados mientras nadie mira).
 */
export function useWinFormsSession(archivo: string, raiz: string | null) {
  const [estado, despachar] = useReducer(reducir, ESTADO_INICIAL)
  const [pedido, setPedido] = useState<{ ensamblado: string | null; vuelta: number }>({
    ensamblado: null,
    vuelta: 0
  })
  const sesionRef = useRef<string | null>(null)

  useEffect(() => {
    const api = window.api?.winforms
    if (!api) {
      return
    }
    const sesion = nuevaSesion()
    sesionRef.current = sesion
    despachar({ tipo: 'reiniciar' })
    const dejar = api.alEvento((mensaje) => {
      if (mensaje.sesion === sesion) {
        despachar({ tipo: 'evento', evento: mensaje.evento })
      }
    })
    void api.abrir({ sesion, archivo, raiz, ensamblado: pedido.ensamblado })
    return () => {
      dejar()
      sesionRef.current = null
      void api.cerrar({ sesion })
    }
  }, [archivo, raiz, pedido])

  const reabrir = useCallback((ensamblado?: string | null) => {
    setPedido((previo) => ({
      ensamblado: ensamblado === undefined ? previo.ensamblado : ensamblado,
      vuelta: previo.vuelta + 1
    }))
  }, [])

  const cerrarDialogo = useCallback(() => {
    const sesion = sesionRef.current
    despachar({ tipo: 'sin-dialogo' })
    if (sesion) {
      void window.api?.winforms?.ordenar({ sesion, orden: 'cerrar-dialogos' })
    }
  }, [])

  return { estado, reabrir, cerrarDialogo }
}
