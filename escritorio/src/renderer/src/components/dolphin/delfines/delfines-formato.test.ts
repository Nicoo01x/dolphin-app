import { describe, expect, it } from 'vitest'
import type { Delfin } from '../../../../../shared/delfines-types'
import {
  estadoDeDelfin,
  horaRelativa,
  ordenarManada,
  plantillaDe,
  presupuestoDe
} from './delfines-formato'

function delfin(extra: Partial<Delfin> = {}): Delfin {
  return {
    id: 'vigia',
    nombre: 'Vigía',
    motor: 'claude',
    permiso: 'leer',
    dir: '/b/vigia',
    carpeta: '/c',
    corriendo: true,
    gasto: { usd: 0, corridas: 0 },
    telegram: false,
    donde: { tipo: 'aca' },
    ...extra
  }
}

describe('cómo se lee un delfín', () => {
  it('lo que te espera gana sobre que esté corriendo, y un servidor mudo gana sobre todo', () => {
    expect(estadoDeDelfin(delfin())).toBe('corriendo')
    expect(estadoDeDelfin(delfin({ corriendo: false }))).toBe('parado')
    expect(estadoDeDelfin(delfin({ pendiente: 'editar' }))).toBe('espera')
    expect(estadoDeDelfin(delfin({ pausa: 'llegó al tope', pendiente: 'x' }))).toBe('pausado')
    expect(
      estadoDeDelfin(
        delfin({
          pausa: 'x',
          donde: { tipo: 'servidor', hostId: 'ssh:v', nombre: 'v', sinRespuesta: true }
        })
      )
    ).toBe('sin-respuesta')
  })

  it('la barra se escala al tope en dólares, o al de corridas, y sin tope no hay barra', () => {
    expect(
      presupuestoDe({ gasto: { usd: 2.5, corridas: 9 }, tope: { usd: 5, corridas: 10 } })
    ).toMatchObject({
      fraccion: 0.5,
      unidad: 'usd'
    })
    expect(
      presupuestoDe({ gasto: { usd: 0, corridas: 12 }, tope: { corridas: 10 } })
    ).toMatchObject({
      fraccion: 1,
      unidad: 'corridas'
    })
    expect(presupuestoDe({ gasto: { usd: 1, corridas: 1 } }).fraccion).toBeNull()
  })

  it('la próxima rutina se dice en la unidad más grande que entra', () => {
    const ahora = Date.parse('2026-11-17T12:00:00.000Z')
    expect(horaRelativa('2026-11-17T12:12:00.000Z', ahora, 'es')).toBe('dentro de 12 minutos')
    expect(horaRelativa('2026-11-17T15:00:00.000Z', ahora, 'en')).toBe('in 3 hours')
    expect(horaRelativa('2026-11-18T12:00:00.000Z', ahora, 'en')).toBe('tomorrow')
    expect(horaRelativa('roto', ahora, 'en')).toBe('')
  })

  it('primero lo que te espera, después lo que corre', () => {
    const orden = ordenarManada([
      delfin({ id: 'a', nombre: 'A', corriendo: false }),
      delfin({ id: 'b', nombre: 'B' }),
      delfin({ id: 'c', nombre: 'C', pendiente: 'x' })
    ])
    expect(orden.map((d) => d.id)).toEqual(['c', 'b', 'a'])
  })

  it('el ícono sale del id cuando el bot se llama como su plantilla', () => {
    expect(plantillaDe({ id: 'vigia-2', permiso: 'leer' })).toBe('vigia')
    expect(plantillaDe({ id: 'ayudante', permiso: 'libre' })).toBeNull()
  })
})
