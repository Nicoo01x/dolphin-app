import { describe, expect, it } from 'vitest'
import { tokensDelTemaElegido } from './tema-de-la-interfaz-settings'
import { CONTRASTE_MINIMO_TEXTO, contraste, leerColor } from './tema-de-la-interfaz'

/**
 * El tema propio no puede cambiar nada hasta que alguien lo elija.
 *
 * Y cuando lo elija, un valor guardado roto tampoco puede dejar la interfaz a medio pintar: ahí
 * vale más quedarse con el tema de la app que mostrar la mitad de los colores nuevos.
 */

const claro = { acento: '#1b7fc4', superficie: '#ffffff', tinta: '#0d3b5c', contraste: 50 }
const oscuro = { ...claro, superficie: '#111111', tinta: '#eeeeee' }

describe('el tema elegido', () => {
  it('sin ajuste no pisa nada', () => {
    expect(tokensDelTemaElegido(undefined, false)).toBeNull()
    expect(tokensDelTemaElegido({}, false)).toBeNull()
  })

  it('apagado no pisa nada, aunque las perillas estén guardadas', () => {
    expect(tokensDelTemaElegido({ activo: false, claro }, false)).toBeNull()
  })

  it('elige el juego según el modo', () => {
    expect(tokensDelTemaElegido({ claro, oscuro }, false)!['--color-background']).toBe('#ffffff')
    expect(tokensDelTemaElegido({ claro, oscuro }, true)!['--color-background']).toBe('#111111')
  })

  it('si falta el juego del modo que está puesto, no inventa el otro', () => {
    expect(tokensDelTemaElegido({ claro }, true)).toBeNull()
  })

  // Un valor roto no puede dejar media interfaz pintada.
  it('con perillas inválidas se queda con el tema de la app', () => {
    expect(tokensDelTemaElegido({ claro: { ...claro, acento: 'azul' } }, false)).toBeNull()
  })

  it('lo que sí pisa sigue respetando el piso de lectura', () => {
    const tokens = tokensDelTemaElegido({ claro: { ...claro, tinta: '#fafafa' } }, false)!
    const fondo = leerColor(tokens['--color-background']!)!
    expect(contraste(leerColor(tokens['--color-foreground']!)!, fondo)).toBeGreaterThanOrEqual(
      CONTRASTE_MINIMO_TEXTO
    )
  })
})
