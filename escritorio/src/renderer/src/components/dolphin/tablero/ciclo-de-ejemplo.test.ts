import { describe, expect, it } from 'vitest'
import {
  DURACION_DE_LA_VUELTA,
  FASES_DE_EJEMPLO,
  hastaElProximoCambio,
  momentoDelEjemplo
} from './ciclo-de-ejemplo'

describe('la tarjeta de ejemplo', () => {
  it('recorre el ciclo en orden: nace en Ideas y termina en Hecho', () => {
    const columnas = Array.from({ length: 18 }, (_, s) => momentoDelEjemplo(s * 1000).columna)
    const orden = columnas.filter((columna, i) => columna !== columnas[i - 1])
    expect(orden).toEqual(['ideas', 'para-hacer', 'haciendo', 'para-revisar', 'hecho'])
  })

  it('la tira del portón se llena de a una fase mientras está en Haciendo', () => {
    const llenas = [3_500, 4_500, 5_300, 6_100, 6_900].map((ms) => momentoDelEjemplo(ms).llenas)
    expect(llenas).toEqual([0, 1, 2, 3, 4])
    expect(momentoDelEjemplo(8_000)).toMatchObject({
      columna: 'para-revisar',
      llenas: FASES_DE_EJEMPLO.length
    })
  })

  it('el ciclo dura unos doce segundos y deja una pausa larga quieta en Hecho', () => {
    expect(momentoDelEjemplo(10_500).columna).toBe('hecho')
    expect(momentoDelEjemplo(16_000)).toMatchObject({ columna: 'hecho', visible: true })
    expect(momentoDelEjemplo(17_600).visible).toBe(false)
  })

  it('vuelve a empezar', () => {
    expect(momentoDelEjemplo(DURACION_DE_LA_VUELTA + 100)).toEqual(momentoDelEjemplo(100))
  })

  it('sabe cuánto falta para el próximo cambio, así no despierta de más', () => {
    expect(hastaElProximoCambio(0)).toBe(1_800)
    expect(hastaElProximoCambio(11_000)).toBe(6_400)
    expect(hastaElProximoCambio(17_500)).toBe(500)
  })
})
