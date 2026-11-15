import { describe, expect, it } from 'vitest'
import { RESORTE_ABRIR, RESORTE_CERRAR, easeDeResorte } from './resorte'

const muestras = (ease: (p: number) => number): number[] =>
  Array.from({ length: 201 }, (_, i) => ease(i / 200))

describe('el resorte de la isla', () => {
  it('arranca en 0 y termina exacto en 1', () => {
    for (const resorte of [RESORTE_ABRIR, RESORTE_CERRAR]) {
      const { ease } = easeDeResorte(resorte)
      expect(ease(0)).toBe(0)
      expect(ease(1)).toBe(1)
    }
  })

  it('al abrir rebota apenas (menos del 4 %) y queda quieto en menos de un segundo', () => {
    const { duracion, ease } = easeDeResorte(RESORTE_ABRIR)
    const pico = Math.max(...muestras(ease))
    expect(pico).toBeGreaterThan(1)
    expect(pico).toBeLessThan(1.04)
    expect(duracion).toBeGreaterThan(0.3)
    expect(duracion).toBeLessThan(1)
  })

  it('al cerrar no rebota y es más corto que al abrir', () => {
    const cerrar = easeDeResorte(RESORTE_CERRAR)
    expect(Math.max(...muestras(cerrar.ease))).toBeLessThanOrEqual(1)
    expect(cerrar.duracion).toBeLessThan(easeDeResorte(RESORTE_ABRIR).duracion)
  })

  it('al cerrar ya llegó al 95 % a los 160 ms: salir lleva la mitad que entrar', () => {
    const { duracion, ease } = easeDeResorte(RESORTE_CERRAR)
    expect(ease(0.16 / duracion)).toBeGreaterThan(0.95)
  })

  it('sobreamortiguado también llega, sin pasarse', () => {
    const { ease } = easeDeResorte({ rigidez: 200, amortiguacion: 60 })
    expect(Math.max(...muestras(ease))).toBeLessThanOrEqual(1)
    expect(ease(1)).toBe(1)
  })
})
