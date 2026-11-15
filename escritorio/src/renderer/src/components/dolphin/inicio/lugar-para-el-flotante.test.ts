import { describe, expect, it } from 'vitest'
import { margenParaElFlotante } from './lugar-para-el-flotante'

// Una ventana de 800 × 757 con la barra lateral abierta: el inicio va de 280 a 800 y la ranura del
// compositor ocupa los últimos 130 px. El botón flotante de la base, por defecto, a 24 px del borde
// derecho y 72 del de abajo de la ventana: 740…776 × 649…685 (la captura v-23).
const RANURA_ANGOSTA = { left: 280, right: 800, top: 627, bottom: 757 }
const BOTON = { left: 740, right: 776, top: 649, bottom: 685 }

describe('el lugar del compositor junto al botón flotante', () => {
  it('angosta: el compositor termina antes del botón, con aire', () => {
    const margen = margenParaElFlotante(RANURA_ANGOSTA, BOTON)
    expect(margen).toBe(800 - 740 + 12)
    // El borde derecho del compositor queda a la izquierda del botón.
    expect(RANURA_ANGOSTA.right - (margen ?? 0)).toBeLessThan(BOTON.left)
  })

  it('ancha: el compositor centrado no llega al botón y no se corre', () => {
    const ranuraAncha = { left: 280, right: 1440, top: 870, bottom: 1000 }
    const botonAncho = { left: 1380, right: 1416, top: 892, bottom: 928 }
    expect(margenParaElFlotante(ranuraAncha, botonAncho)).toBeNull()
  })

  it('si la persona llevó el botón arriba, el compositor no se corre', () => {
    expect(
      margenParaElFlotante(RANURA_ANGOSTA, { left: 740, right: 776, top: 100, bottom: 136 })
    ).toBeNull()
  })

  it('sin botón (o escondido, con una caja en cero) queda como siempre', () => {
    expect(margenParaElFlotante(RANURA_ANGOSTA, null)).toBeNull()
    expect(
      margenParaElFlotante(RANURA_ANGOSTA, { left: 0, right: 0, top: 0, bottom: 0 })
    ).toBeNull()
  })
})
