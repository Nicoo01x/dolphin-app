import { describe, expect, it } from 'vitest'
import { ventanaDelPlan } from './ventana-del-plan'

const ventana = (usedPercent: number, resetDescription: string | null = null) => ({
  usedPercent,
  windowMinutes: 300,
  resetsAt: null,
  resetDescription
})

describe('la ventana del plan que se muestra', () => {
  it('con la de 5 h recién renovada y la semana casi llena, muestra la semana', () => {
    expect(
      ventanaDelPlan({
        session: ventana(1, '2:20 a. m.'),
        weekly: ventana(99, 'sáb'),
        fableWeekly: null
      })
    ).toEqual({ tipo: 'semana', usedPercent: 99, resetDescription: 'sáb' })
  })

  it('a igual porcentaje gana la de 5 h, que se renueva antes', () => {
    expect(
      ventanaDelPlan({ session: ventana(40), weekly: ventana(40), fableWeekly: null })?.tipo
    ).toBe('sesion')
  })

  it('cuenta la semanal de Fable como semana', () => {
    expect(
      ventanaDelPlan({ session: ventana(10), weekly: ventana(20), fableWeekly: ventana(70) })
    ).toMatchObject({ tipo: 'semana', usedPercent: 70 })
  })

  it('sin datos no inventa un 0 %', () => {
    expect(ventanaDelPlan(null)).toBeNull()
    expect(ventanaDelPlan({ session: null, weekly: null, fableWeekly: null })).toBeNull()
  })
})
