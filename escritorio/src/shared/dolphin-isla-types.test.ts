import { describe, expect, it } from 'vitest'
import { LARGO_MAXIMO_NOTAS, esPreferenciasDeIsla, esRespuestaDeEstudio } from './dolphin-isla-types'

describe('lo que la isla puede pedir que se guarde', () => {
  it('acepta cualquier parte por separado, los avisos incluidos', () => {
    expect(esPreferenciasDeIsla({})).toBe(true)
    expect(esPreferenciasDeIsla({ armado: { orden: ['notas'], ocultas: [] } })).toBe(true)
    expect(esPreferenciasDeIsla({ notas: 'llamar a Pablo' })).toBe(true)
    expect(esPreferenciasDeIsla({ avisos: false })).toBe(true)
    expect(esPreferenciasDeIsla({ posicion: { centro: 500, arriba: 8, displayId: 1 } })).toBe(true)
  })

  it('solo acepta una posición numérica completa', () => {
    expect(esPreferenciasDeIsla({ posicion: { centro: '500', arriba: 8, displayId: 1 } })).toBe(
      false
    )
    expect(esPreferenciasDeIsla({ posicion: { centro: 500, arriba: 8, displayId: 1.5 } })).toBe(
      false
    )
  })

  it('los avisos son sí o no: otra cosa no se guarda', () => {
    expect(esPreferenciasDeIsla({ avisos: 'no' })).toBe(false)
    expect(esPreferenciasDeIsla({ avisos: 0 })).toBe(false)
    expect(esPreferenciasDeIsla({ avisos: null })).toBe(false)
  })

  it('una nota demasiado larga o algo que no es un objeto, tampoco', () => {
    expect(esPreferenciasDeIsla({ notas: 'x'.repeat(LARGO_MAXIMO_NOTAS + 1) })).toBe(false)
    expect(esPreferenciasDeIsla([])).toBe(false)
    expect(esPreferenciasDeIsla(null)).toBe(false)
  })
})

describe('respuesta del estudio de la isla', () => {
  it('rechaza datos fuera del contrato', () => {
    expect(esRespuestaDeEstudio({ id: 'r', estudio: { disponible: true, agentes: [] } })).toBe(true)
    expect(
      esRespuestaDeEstudio({
        id: 'r',
        estudio: {
          disponible: true,
          agentes: [{ paneKey: 'p', archivos: Array.from({ length: 9 }, () => ({ ruta: 'a', accion: 'editado' })) }]
        }
      })
    ).toBe(false)
  })
})
