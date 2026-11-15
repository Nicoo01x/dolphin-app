import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'

/** Lo que dice la isla compacta: cuántos te esperan, cuántos trabajan y cuántos terminaron. */
export type ResumenIsla = {
  esperan: number
  trabajan: number
  listos: number
  /** El que más importa ahora: el primero que te espera, si no el que trabaja, si no el último listo. */
  destacado: DashboardCard | null
}

/** En la lista abierta, primero lo que necesita algo de vos, después lo que corre, después lo listo. */
const ORDEN: Record<DashboardCard['bucket'], number> = {
  attention: 0,
  working: 1,
  done: 2,
  idle: 3
}

export function ordenarParaIsla(cards: readonly DashboardCard[]): DashboardCard[] {
  return [...cards]
    .filter((card) => card.bucket !== 'idle')
    .sort((a, b) => ORDEN[a.bucket] - ORDEN[b.bucket])
}

export function resumirIsla(cards: readonly DashboardCard[]): ResumenIsla {
  const ordenadas = ordenarParaIsla(cards)
  return {
    esperan: cards.filter((card) => card.bucket === 'attention').length,
    trabajan: cards.filter((card) => card.bucket === 'working').length,
    listos: cards.filter((card) => card.bucket === 'done').length,
    destacado: ordenadas[0] ?? null
  }
}
