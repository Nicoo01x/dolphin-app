import { describe, expect, it } from 'vitest'
import {
  bajoElLente,
  encuadre,
  enLente,
  luminanciaDe,
  medidasDelEncuadre,
  muestra,
  nivelesDe,
  revelado,
  tonoDe
} from './trama'

describe('la lámina', () => {
  it('estira el escaneo a su negro y su blanco reales', () => {
    const grises = Array.from({ length: 100 }, (_, i) => 0.3 + (i / 99) * 0.4)
    const [negro, blanco] = nivelesDe(grises)
    expect(negro).toBeCloseTo(0.31, 1)
    expect(blanco).toBeCloseTo(0.69, 1)
  })

  it('pasa los píxeles a luminancia de 0 a 1', () => {
    const rgba = [0, 0, 0, 255, 255, 255, 255, 255]
    const lamina = luminanciaDe(rgba, 2, 1)
    expect(Array.from(lamina.datos)).toEqual([0, 1])
  })

  it('va pegada a la derecha y arriba, más alta que la franja, y a su izquierda no hay nada', () => {
    // Alto doble: 1000 px de lámina en 250 de franja → 2 px de lámina por px del lienzo,
    // así que la lámina ocupa 500 px de ancho, de x = 500 a 1000.
    const aLamina = encuadre(1000, 250, { ancho: 1000, alto: 1000 }, { alto: 2, fundido: 0.2 })
    expect(aLamina(1000, 0)).toEqual([1000, 0, 1])
    expect(aLamina(750, 250)).toEqual([500, 500, 1])
    expect(aLamina(400, 100)[2]).toBe(0)
    // El borde izquierdo se funde: a mitad del fundido, media tinta.
    expect(aLamina(550, 0)[2]).toBeCloseTo(0.5)
  })

  describe('nunca más ancha que su tope', () => {
    // Una lámina de 4:3 con alto 1,15 en una franja de 300: ocuparía 460 px de ancho.
    const lamina = { ancho: 960, alto: 720 }
    const composicion = { alto: 1.15, fundido: 0.25, anchoMaximo: 0.62 }

    it('si entra, queda como siempre: pegada arriba y a la derecha, a su tamaño', () => {
      const m = medidasDelEncuadre(1400, 300, lamina, composicion)
      expect(m.ancho).toBeCloseTo(460)
      expect(m.izquierda).toBeCloseTo(940)
      expect(m.arriba).toBe(0)
    })

    it('a lo ancho no pasa del 62 % de la franja, en ninguna medida', () => {
      for (const ancho of [500, 700, 900, 1100, 1400]) {
        for (const alto of [300, 420, 560]) {
          const m = medidasDelEncuadre(ancho, alto, lamina, composicion)
          expect(m.ancho).toBeLessThanOrEqual(ancho * 0.62 + 1e-6)
          // Y empieza donde termina el 38 % de la izquierda, o más a la derecha.
          expect(m.izquierda).toBeGreaterThanOrEqual(ancho * 0.38 - 1e-6)
        }
      }
    })

    it('si no entra se achica sin deformarse, anclada abajo a la derecha', () => {
      // 700 de ancho: el tope es 434 px, menos que los 460 que ocuparía.
      const m = medidasDelEncuadre(700, 300, lamina, composicion)
      expect(m.ancho).toBeCloseTo(434)
      expect(m.izquierda).toBeCloseTo(266)
      // Misma proporción: 960 px de lámina en 434 de lienzo, a lo ancho y a lo alto.
      expect(m.escala).toBeCloseTo(960 / 434)
      // El pie de la franja muestra la misma fila de la lámina que a tamaño entero (720 / 1,15).
      expect((300 - m.arriba) * m.escala).toBeCloseTo(720 / 1.15)
      expect(m.arriba).toBeGreaterThan(0)
    })

    it('encima de la lámina achicada no hay trama, y su borde izquierdo se sigue fundiendo', () => {
      const aLamina = encuadre(700, 300, lamina, composicion)
      expect(aLamina(600, 1)[2]).toBe(0)
      expect(aLamina(200, 299)[2]).toBe(0)
      expect(aLamina(699, 299)[2]).toBe(1)
      expect(aLamina(266 + 434 * 0.25 * 0.5, 299)[2]).toBeCloseTo(0.5)
    })
  })

  it('interpola entre píxeles vecinos', () => {
    const lamina = { ancho: 2, alto: 1, datos: new Float32Array([0, 1]) }
    expect(muestra(lamina, 1, 0.5)).toBeCloseTo(0.5)
  })
})

describe('el tono de un punto', () => {
  it('es la tinta de la lámina: el papel no lleva puntos y la sombra los lleva llenos', () => {
    expect(tonoDe(0.9)).toBe(0)
    expect(tonoDe(0.1)).toBe(1)
    expect(tonoDe(0.4)).toBeGreaterThan(tonoDe(0.6))
  })
})

describe('el dibujo al abrir', () => {
  it('empieza por lo hondo (abajo) y termina en la superficie', () => {
    expect(revelado(1, 0, 0.1)).toBeGreaterThan(0)
    expect(revelado(0, 0, 0.1)).toBe(0)
  })

  it('al terminar están todos los puntos enteros', () => {
    for (const altura of [0, 0.5, 1]) {
      for (const desorden of [0, 0.5, 1]) {
        expect(revelado(altura, desorden, 1)).toBe(1)
      }
    }
  })
})

describe('el catalejo', () => {
  const lente = { x: 100, y: 100, radio: 50 }

  it('es un círculo: adentro sí, afuera no', () => {
    expect(enLente(100, 100, lente)).toBe(1)
    expect(enLente(200, 100, lente)).toBe(0)
    expect(enLente(100, 100, null)).toBe(0)
  })

  it('acerca alrededor de su centro', () => {
    expect(bajoElLente(100, 100, lente, 2)).toEqual([100, 100])
    expect(bajoElLente(140, 100, lente, 2)).toEqual([120, 100])
  })
})
