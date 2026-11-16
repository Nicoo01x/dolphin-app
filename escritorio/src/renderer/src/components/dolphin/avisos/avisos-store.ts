import { create } from 'zustand'
import {
  COLA_VACIA,
  encolar,
  mostrar,
  quitar,
  type Aviso,
  type EstadoDeLaCola
} from './cola-de-avisos'

/**
 * Dónde viven los avisos pendientes. Es un store aparte del de la app a propósito: los avisos
 * llevan funciones y contenido de React, que no se guardan ni viajan entre ventanas.
 */
export const useColaDeAvisos = create<EstadoDeLaCola>(() => COLA_VACIA)

/** Pone un aviso en la cola. Mismo id, mismo lugar: se actualiza el contenido y nada más. */
export function encolarAviso(aviso: Aviso): void {
  useColaDeAvisos.setState((estado) => encolar(estado, aviso))
}

/**
 * Lo saca el código que lo levantó (el ajuste se resolvió por otro lado, la skill ya se
 * actualizó). No es una respuesta de la persona: no llama a `alDescartar`.
 */
export function retirarAviso(id: string): void {
  useColaDeAvisos.setState((estado) => quitar(estado, id, Date.now()))
}

export function mostrarAviso(id: string): void {
  const antes = useColaDeAvisos.getState()
  const despues = mostrar(antes, id)
  if (despues === antes) {
    return
  }
  useColaDeAvisos.setState(despues)
  despues.avisos.find((aviso) => aviso.id === id)?.alMostrar?.()
}

export type ComoSeCerro = 'respondido' | 'descartado'

export function cerrarAviso(id: string, como: ComoSeCerro): void {
  const aviso = useColaDeAvisos.getState().avisos.find((enCola) => enCola.id === id)
  if (!aviso) {
    return
  }
  useColaDeAvisos.setState((estado) => quitar(estado, id, Date.now()))
  if (como === 'descartado') {
    aviso.alDescartar?.()
  }
}

/** Para los tests y las fixtures: arranca de cero, como una sesión nueva. */
export function vaciarColaDeAvisos(): void {
  useColaDeAvisos.setState(COLA_VACIA, true)
}
