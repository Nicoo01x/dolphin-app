import type { ProviderRateLimits, RateLimitWindow } from '../../../../../shared/rate-limit-types'

export type VentanaDelPlan = {
  /** `sesion` es la de 5 h; `semana`, cualquiera de las semanales (la de Fable incluida). */
  tipo: 'sesion' | 'semana'
  usedPercent: number
  resetDescription: string | null
}

/**
 * La ventana del plan que más cerca está de cortarte. La de 5 h puede estar en 1 % recién
 * renovada mientras la semanal está en 99 %: mostrar solo la de 5 h dice «sobra» justo
 * cuando no sobra nada. A igual porcentaje gana la de 5 h, que es la que se renueva antes.
 */
export function ventanaDelPlan(
  limits: Pick<ProviderRateLimits, 'session' | 'weekly' | 'fableWeekly'> | null | undefined
): VentanaDelPlan | null {
  const candidatas: [VentanaDelPlan['tipo'], RateLimitWindow | null | undefined][] = [
    ['sesion', limits?.session],
    ['semana', limits?.weekly],
    ['semana', limits?.fableWeekly]
  ]
  let elegida: VentanaDelPlan | null = null
  for (const [tipo, ventana] of candidatas) {
    if (!ventana || !Number.isFinite(ventana.usedPercent)) {
      continue
    }
    if (!elegida || ventana.usedPercent > elegida.usedPercent) {
      elegida = {
        tipo,
        usedPercent: ventana.usedPercent,
        resetDescription: ventana.resetDescription
      }
    }
  }
  return elegida
}
