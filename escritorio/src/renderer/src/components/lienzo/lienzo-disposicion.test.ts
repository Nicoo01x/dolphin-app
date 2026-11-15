import { describe, expect, it, vi } from 'vitest'
import { ZOOM_MAX } from './canvas'
import { guardarDisposicion, leerDisposicion } from './lienzo-disposicion'
import type { PanelDelLienzo } from './lienzo-paneles'

const panel: PanelDelLienzo = {
  id: 'nueva',
  tipo: 'consola',
  titulo: 'Largar un agente',
  subtitulo: 'nueva',
  rect: { x: 72, y: 64, width: 640, height: 480 }
}

const conLoGuardado = (texto: string | null): Pick<Storage, 'getItem'> => ({ getItem: () => texto })

describe('cómo quedó el lienzo la última vez', () => {
  it('vuelve tal cual se guardó', () => {
    const guardado: Record<string, string> = {}
    guardarDisposicion(
      { paneles: [panel], vista: { zoom: 0.8, x: 120, y: -40 } },
      { setItem: (k, v) => (guardado[k] = v) }
    )
    const leido = leerDisposicion(conLoGuardado(Object.values(guardado)[0]!))
    expect(leido).toEqual({ paneles: [panel], vista: { zoom: 0.8, x: 120, y: -40 } })
  })

  it('la primera vez no hay nada y el lienzo abre como siempre', () => {
    expect(leerDisposicion(conLoGuardado(null))).toBeNull()
  })

  it('un guardado roto no deja la vista en blanco', () => {
    for (const roto of [
      '',
      '{',
      'null',
      '[]',
      '"texto"',
      '{"paneles":"no es una lista"}',
      '{"paneles":[]}'
    ]) {
      expect(leerDisposicion(conLoGuardado(roto)), roto).toBeNull()
    }
  })

  it('una ventana con datos que no cierran se descarta, y las sanas quedan', () => {
    const texto = JSON.stringify({
      paneles: [
        panel,
        { ...panel, id: 'sinRect', rect: undefined },
        { ...panel, id: 'conTexto', rect: { x: 'acá', y: 0, width: 400, height: 300 } },
        { ...panel, id: 'invisible', rect: { x: 0, y: 0, width: 0, height: 0 } },
        { ...panel, id: 'tipoRaro', tipo: 'loquesea' },
        {
          ...panel,
          id: 'conInfinito',
          rect: { x: 0, y: Number.POSITIVE_INFINITY, width: 400, height: 300 }
        }
      ],
      vista: { zoom: 1, x: 0, y: 0 }
    })
    expect(leerDisposicion(conLoGuardado(texto))?.paneles.map((p) => p.id)).toEqual(['nueva'])
  })

  it('un zoom imposible se recorta en vez de dejar el lienzo inservible', () => {
    const texto = JSON.stringify({ paneles: [panel], vista: { zoom: 9000, x: 0, y: 0 } })
    expect(leerDisposicion(conLoGuardado(texto))?.vista.zoom).toBe(ZOOM_MAX)
    expect(leerDisposicion(conLoGuardado(JSON.stringify({ paneles: [panel] })))?.vista).toEqual({
      zoom: 1,
      x: 0,
      y: 0
    })
  })

  it('sin almacenamiento no se rompe nada', () => {
    const explota = (): never => {
      throw new Error('bloqueado')
    }
    expect(leerDisposicion({ getItem: explota })).toBeNull()
    const guardar = vi.fn(explota)
    expect(() =>
      guardarDisposicion({ paneles: [panel], vista: { zoom: 1, x: 0, y: 0 } }, { setItem: guardar })
    ).not.toThrow()
    expect(guardar).toHaveBeenCalled()
  })
})
