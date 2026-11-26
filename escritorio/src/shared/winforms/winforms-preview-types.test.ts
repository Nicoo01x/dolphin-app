import { describe, expect, it } from 'vitest'
import { leerEventoDelHost } from './winforms-preview-types'

describe('leerEventoDelHost', () => {
  it('limpia el texto de un diálogo de error de la app', () => {
    const linea = JSON.stringify({
      evento: 'dialogo',
      titulo: 'Ventas Error',
      texto:
        'Mostrar detalle\nSe produjo un error de sistema inesperado.<br><br><b>- Referencia a objeto no establecida como instancia de un objeto.\nEnviar...\n&Cerrar'
    })
    expect(leerEventoDelHost(linea)).toEqual({
      evento: 'dialogo',
      titulo: 'Ventas Error',
      texto:
        'Se produjo un error de sistema inesperado. Referencia a objeto no establecida como instancia de un objeto.'
    })
  })

  it('ignora líneas que no son eventos', () => {
    expect(leerEventoDelHost('no es json')).toBeNull()
    expect(leerEventoDelHost('{"evento":"otro"}')).toBeNull()
    expect(leerEventoDelHost('{"evento":"fase","fase":"inventada"}')).toBeNull()
  })

  it('descarta controles malformados del mapa', () => {
    const evento = leerEventoDelHost(
      '{"evento":"controles","ancho":10,"alto":10,"controles":[null,{"id":1,"nombre":"a","x":1}]}'
    )
    expect(evento?.evento === 'controles' && evento.controles).toEqual([
      { id: 1, padre: -1, nivel: 0, nombre: 'a', tipo: '', texto: '', x: 1, y: 0, w: 0, h: 0 }
    ])
  })
})
