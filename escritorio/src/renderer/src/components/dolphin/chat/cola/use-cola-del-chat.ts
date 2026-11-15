import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { EstadoDeCola } from './cola-del-chat-modelo'
import { leerCola, montarListaDeCola, suscribirCola, vaciarSiToca } from './cola-del-chat-store'

/** Cada cuánto se vuelve a mirar mientras se espera que arranque el turno de lo entregado. */
const REVISION_DE_LA_ESPERA_MS = 1_000

export function useEstadoDeLaCola(clave: string): EstadoDeCola {
  const suscribir = useCallback((oyente: () => void) => suscribirCola(clave, oyente), [clave])
  const leer = useCallback(() => leerCola(clave), [clave])
  return useSyncExternalStore(suscribir, leer, leer)
}

/**
 * La cola avanza sola: cuando el agente termina el turno y el chat puede recibir, sale el primero.
 *
 * Why acá y no en el composer: el composer está oculto mientras hay una pregunta del agente a la
 * vista, y ahí la cola tiene que esperar igual. Este hook vive con la lista, que es lo que ve la
 * persona: si no hay lista a la vista, el composer tampoco retiene nada.
 */
export function useVaciadoDeLaCola(
  clave: string,
  senales: { trabajando: boolean; puedeRecibir: boolean }
): EstadoDeCola {
  const estado = useEstadoDeLaCola(clave)
  const { trabajando, puedeRecibir } = senales
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => montarListaDeCola(clave), [clave])
  useEffect(() => {
    const { esperando } = vaciarSiToca(clave, { trabajando, puedeRecibir })
    if (!esperando) {
      return
    }
    const revision = setTimeout(() => setVuelta((n) => n + 1), REVISION_DE_LA_ESPERA_MS)
    return () => clearTimeout(revision)
  }, [clave, trabajando, puedeRecibir, estado, vuelta])
  return estado
}
