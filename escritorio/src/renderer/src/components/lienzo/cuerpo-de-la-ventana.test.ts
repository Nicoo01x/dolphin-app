import { describe, expect, it } from 'vitest'
import { CHROME_DE_LA_VENTANA, cuerpoEnElPlano } from './PanelFlotante'

describe('el hueco que le queda al contenido de una ventana', () => {
  it('descuenta la cabecera y el marco, en coordenadas del plano', () => {
    expect(cuerpoEnElPlano({ width: 720, height: 420 })).toEqual({
      width: 720 - CHROME_DE_LA_VENTANA.margen * 2,
      height: 420 - CHROME_DE_LA_VENTANA.cabecera - CHROME_DE_LA_VENTANA.margen
    })
  })

  it('no devuelve medidas negativas con una ventana más chica que su propia cabecera', () => {
    // Pasa a mitad de un estiro: `LIMITES` frena después, y un alto negativo le mandaría al PTY
    // un tamaño imposible.
    expect(cuerpoEnElPlano({ width: 4, height: 10 })).toEqual({ width: 0, height: 0 })
  })
})
