import { describe, expect, it } from 'vitest'
import {
  CONTRASTE_MINIMO_TENUE,
  CONTRASTE_MINIMO_TEXTO,
  colorLegible,
  contraste,
  escribirColor,
  leerColor,
  luminancia,
  tokensDelTema,
  type PerillasDelTema
} from './tema-de-la-interfaz'

/**
 * Personalizar los colores no puede ser una forma de romper la app.
 *
 * Lo que fija esta prueba es el piso: elijas lo que elijas, el texto se tiene que leer. Un
 * selector que deja poner gris claro sobre blanco no es personalización.
 */

const rgb = (hex: string) => leerColor(hex)!

describe('leer y escribir colores', () => {
  it('entiende las tres formas de hex', () => {
    expect(leerColor('#fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(leerColor('#1b7fc4')).toEqual({ r: 27, g: 127, b: 196 })
    // La transparencia se ignora a propósito: acá se decide color, no capa.
    expect(leerColor('#1b7fc480')).toEqual({ r: 27, g: 127, b: 196 })
  })

  it('sin almohadilla también', () => {
    expect(leerColor('1b7fc4')).toEqual({ r: 27, g: 127, b: 196 })
  })

  it('devuelve null con basura, en vez de un color inventado', () => {
    expect(leerColor('rojo')).toBeNull()
    expect(leerColor('#12345')).toBeNull()
    expect(leerColor('')).toBeNull()
  })

  it('ida y vuelta', () => {
    expect(escribirColor(rgb('#1b7fc4'))).toBe('#1b7fc4')
  })
})

describe('contraste', () => {
  it('negro contra blanco es el máximo', () => {
    expect(contraste(rgb('#000'), rgb('#fff'))).toBeCloseTo(21, 1)
  })

  it('un color contra sí mismo es 1', () => {
    expect(contraste(rgb('#1b7fc4'), rgb('#1b7fc4'))).toBeCloseTo(1, 5)
  })

  // El verde pesa mucho más que el azul: no es el promedio de los canales.
  it('el verde pesa más que el azul', () => {
    expect(luminancia(rgb('#00ff00'))).toBeGreaterThan(luminancia(rgb('#0000ff')))
  })
})

describe('corregir un color hasta que se lea', () => {
  it('un color que ya se lee no se toca', () => {
    const negro = rgb('#000')
    expect(colorLegible(negro, rgb('#fff'), CONTRASTE_MINIMO_TEXTO)).toEqual(negro)
  })

  it('gris claro sobre blanco se oscurece hasta llegar al piso', () => {
    const corregido = colorLegible(rgb('#cccccc'), rgb('#ffffff'), CONTRASTE_MINIMO_TEXTO)
    expect(contraste(corregido, rgb('#ffffff'))).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO)
  })

  it('gris oscuro sobre negro se aclara', () => {
    const corregido = colorLegible(rgb('#222222'), rgb('#000000'), CONTRASTE_MINIMO_TEXTO)
    expect(contraste(corregido, rgb('#000000'))).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO)
    expect(luminancia(corregido)).toBeGreaterThan(luminancia(rgb('#222222')))
  })

  it('en el peor caso termina en blanco o negro, nunca ilegible', () => {
    const corregido = colorLegible(rgb('#808080'), rgb('#808080'), CONTRASTE_MINIMO_TEXTO)
    expect(contraste(corregido, rgb('#808080'))).toBeGreaterThanOrEqual(3)
  })
})

describe('el juego de tokens', () => {
  const claro: PerillasDelTema = {
    acento: '#1b7fc4',
    superficie: '#ffffff',
    tinta: '#0d3b5c',
    contraste: 50
  }
  const oscuro: PerillasDelTema = { ...claro, superficie: '#111111', tinta: '#eeeeee' }

  it('devuelve null si alguna perilla no es un color', () => {
    expect(tokensDelTema({ ...claro, acento: 'azul' })).toBeNull()
  })

  it('el fondo es el que eligió la persona', () => {
    expect(tokensDelTema(claro)!['--color-background']).toBe('#ffffff')
  })

  // Lo que no se negocia, elija lo que elija.
  it.each([
    ['claro', claro],
    ['oscuro', oscuro],
    ['tinta imposible', { ...claro, tinta: '#fdfdfd' } as PerillasDelTema],
    ['sin contraste', { ...claro, contraste: 0 } as PerillasDelTema]
  ])('el texto se lee: %s', (_caso, perillas) => {
    const tokens = tokensDelTema(perillas)!
    const fondo = rgb(tokens['--color-background']!)
    expect(contraste(rgb(tokens['--color-foreground']!), fondo)).toBeGreaterThanOrEqual(
      CONTRASTE_MINIMO_TEXTO
    )
    expect(contraste(rgb(tokens['--color-muted-foreground']!), fondo)).toBeGreaterThanOrEqual(
      CONTRASTE_MINIMO_TENUE
    )
  })

  it('el texto sobre el acento se elige para que se lea', () => {
    const conAcentoClaro = tokensDelTema({ ...claro, acento: '#f7c948' })!
    expect(conAcentoClaro['--color-primary-foreground']).toBe('#000000')
    const conAcentoOscuro = tokensDelTema({ ...claro, acento: '#0d3b5c' })!
    expect(conAcentoOscuro['--color-primary-foreground']).toBe('#ffffff')
  })

  it('más contraste despega los planos del fondo', () => {
    const poco = tokensDelTema({ ...oscuro, contraste: 0 })!
    const mucho = tokensDelTema({ ...oscuro, contraste: 100 })!
    const fondo = rgb(oscuro.superficie)
    expect(contraste(rgb(mucho['--color-card']!), fondo)).toBeGreaterThan(
      contraste(rgb(poco['--color-card']!), fondo)
    )
  })

  it('el acento llega tal cual a la acción principal', () => {
    expect(tokensDelTema(claro)!['--color-primary']).toBe('#1b7fc4')
  })
})
