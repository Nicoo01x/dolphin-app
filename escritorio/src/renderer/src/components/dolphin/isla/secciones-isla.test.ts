import { describe, expect, it } from 'vitest'
import {
  ARMADO_DE_FABRICA,
  alternarSeccion,
  moverSeccion,
  sanearArmado,
  seccionesVisibles
} from './secciones-isla'

describe('cómo se arma la isla', () => {
  it('de fábrica se ven las cuatro, en orden', () => {
    expect(seccionesVisibles(ARMADO_DE_FABRICA)).toEqual(['agentes', 'bandeja', 'notas', 'estudio'])
  })

  it('lo guardado se sanea: sin repetidas ni inventadas, y una sección nueva aparece al final', () => {
    expect(
      sanearArmado({
        orden: ['notas', 'notas', 'cualquiera', 'agentes'],
        ocultas: ['x', 'agentes']
      })
    ).toEqual({ orden: ['notas', 'agentes', 'bandeja', 'estudio'], ocultas: ['agentes'] })
    expect(sanearArmado('roto')).toEqual(ARMADO_DE_FABRICA)
  })

  it('nunca quedan todas ocultas: ni guardadas así ni ocultando la última', () => {
    expect(sanearArmado({ ocultas: ['agentes', 'bandeja', 'notas'] })).toEqual({
      orden: ['agentes', 'bandeja', 'notas', 'estudio'],
      ocultas: ['agentes', 'bandeja', 'notas']
    })
    expect(sanearArmado({ ocultas: ['agentes', 'bandeja', 'notas', 'estudio'] })).toEqual(
      ARMADO_DE_FABRICA
    )
    let armado = alternarSeccion(ARMADO_DE_FABRICA, 'bandeja')
    armado = alternarSeccion(armado, 'notas')
    expect(seccionesVisibles(alternarSeccion(armado, 'agentes'))).toEqual(['estudio'])
    expect(seccionesVisibles(alternarSeccion(armado, 'notas'))).toEqual([
      'agentes',
      'notas',
      'estudio'
    ])
  })

  it('se mueve de a un lugar y en el borde se queda', () => {
    expect(moverSeccion(ARMADO_DE_FABRICA, 'notas', -1).orden).toEqual([
      'agentes',
      'notas',
      'bandeja',
      'estudio'
    ])
    expect(moverSeccion(ARMADO_DE_FABRICA, 'agentes', -1)).toBe(ARMADO_DE_FABRICA)
  })
})
