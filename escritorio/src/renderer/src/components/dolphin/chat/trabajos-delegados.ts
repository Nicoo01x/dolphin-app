import { useMemo, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import type { TrabajoDelegado } from './delegar-en-trabajos'

/**
 * Los compañeros que una delegación abrió en este proyecto, para poder llegar a ellos después de
 * cerrar la ventana que los propuso.
 *
 * Por qué no vive en el estado de la ventana, que es donde estaba: la ventana se descarta —con su X,
 * o sola en cuanto el líder propone otro plan— y con ella se iba el único botón que llevaba a cada
 * compañero. Y los compañeros no se pueden encontrar solos: son pestañas de verdad, pero se abren
 * **sin activarse** (a propósito, delegar no te saca del chat que estabas leyendo), así que quedan
 * trabajando sin nada a la vista que los nombre.
 *
 * No se guarda en disco: lo que persiste son las pestañas. Si la app se reinicia, los compañeros
 * siguen ahí como pestañas y esta lista se arma de nuevo en la próxima delegación.
 */

const porWorktree = new Map<string, readonly TrabajoDelegado[]>()
const oyentes = new Set<() => void>()
const NINGUNO: readonly TrabajoDelegado[] = Object.freeze([])

function avisar(): void {
  for (const oyente of oyentes) {
    oyente()
  }
}

/**
 * Suma los compañeros de una delegación a los que el proyecto ya tenía.
 *
 * Suma en vez de reemplazar, y por `tabId`: delegar dos planes seguidos deja los dos equipos
 * trabajando, así que la tira tiene que nombrar a los dos. Lo que saca a uno de la lista es que su
 * pestaña se cierre, no que llegue otro plan.
 */
export function recordarTrabajos(worktreeId: string, trabajos: readonly TrabajoDelegado[]): void {
  if (trabajos.length === 0) {
    return
  }
  const previos = porWorktree.get(worktreeId) ?? NINGUNO
  const nuevos = trabajos.filter(
    (trabajo) => !previos.some((previo) => previo.tabId === trabajo.tabId)
  )
  if (nuevos.length === 0) {
    return
  }
  porWorktree.set(worktreeId, [...previos, ...nuevos])
  avisar()
}

/** Esconde la tira de este proyecto. No cierra ningún compañero: siguen siendo pestañas. */
export function olvidarTrabajos(worktreeId: string): void {
  if (porWorktree.delete(worktreeId)) {
    avisar()
  }
}

export function trabajosRecordados(worktreeId: string | null): readonly TrabajoDelegado[] {
  return (worktreeId === null ? undefined : porWorktree.get(worktreeId)) ?? NINGUNO
}

export function suscribirseATrabajos(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

/** Solo para las pruebas: deja la memoria como recién arrancada. */
export function vaciarTrabajosRecordados(): void {
  porWorktree.clear()
  avisar()
}

/**
 * Los compañeros de este proyecto que siguen abiertos.
 *
 * El filtro contra las pestañas vivas es lo que hace honesta a la tira: si cerrás un compañero, su
 * pastilla se va, en vez de quedar prometiendo un lugar al que ya no se puede ir.
 */
export function useTrabajosDelegados(worktreeId: string | null): readonly TrabajoDelegado[] {
  const recordados = useSyncExternalStore(
    suscribirseATrabajos,
    () => trabajosRecordados(worktreeId),
    () => NINGUNO
  )
  const pestanas = useAppStore((state) =>
    worktreeId === null ? undefined : state.tabsByWorktree[worktreeId]
  )
  return useMemo(() => {
    if (recordados.length === 0) {
      return NINGUNO
    }
    const vivas = new Set((pestanas ?? []).map((pestana) => pestana.id))
    const abiertos = recordados.filter((trabajo) => vivas.has(trabajo.tabId))
    return abiertos.length === recordados.length ? recordados : abiertos
  }, [recordados, pestanas])
}
