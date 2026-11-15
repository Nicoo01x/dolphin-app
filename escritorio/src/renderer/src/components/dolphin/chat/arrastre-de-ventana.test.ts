import { describe, expect, it } from 'vitest'
import { moverVentana, POSICION_INICIAL, type LimitesDelPanel } from './arrastre-de-ventana'

const PANEL: LimitesDelPanel = { ancho: 900, alto: 600, anchoVentana: 320, altoVentana: 240 }

describe('mover la ventana flotante adentro del panel', () => {
  it('a la izquierda y arriba crecen las distancias a la esquina de abajo a la derecha', () => {
    expect(moverVentana(POSICION_INICIAL, { x: -40, y: -30 }, PANEL)).toEqual({
      derecha: 56,
      abajo: 46
    })
  })

  it('a la derecha y abajo se frena antes de perder la cabecera', () => {
    // Arrastrada muy a la derecha y muy abajo: queda asomando, con 48 px adentro.
    expect(moverVentana(POSICION_INICIAL, { x: 2000, y: 2000 }, PANEL)).toEqual({
      derecha: 48 - PANEL.anchoVentana,
      abajo: 48 - PANEL.altoVentana
    })
  })

  it('a la izquierda y arriba se frena contra el otro borde', () => {
    expect(moverVentana(POSICION_INICIAL, { x: -5000, y: -5000 }, PANEL)).toEqual({
      derecha: PANEL.ancho - 48,
      abajo: PANEL.alto - 48
    })
  })

  it('en un panel más chico que la ventana no se va de viaje: lo tapa entero', () => {
    const angosto: LimitesDelPanel = { ancho: 30, alto: 20, anchoVentana: 320, altoVentana: 240 }
    const movida = moverVentana({ derecha: 0, abajo: 0 }, { x: -500, y: -500 }, angosto)
    // El tope de la izquierda cae del otro lado del borde, así que la ventana cubre el panel
    // completo en vez de salir volando por arriba a la izquierda.
    expect(movida).toEqual({ derecha: 30 - 48, abajo: 20 - 48 })
  })

  it('sin movimiento no cambia de lugar', () => {
    expect(moverVentana({ derecha: 120, abajo: 90 }, { x: 0, y: 0 }, PANEL)).toEqual({
      derecha: 120,
      abajo: 90
    })
  })
})
