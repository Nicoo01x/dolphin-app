import { describe, expect, it } from 'vitest'
import {
  curvaDelVuelo,
  prepararVuelo,
  siguienteZoom,
  vistaQueCentra,
  zoomParaRevelar
} from './camara'

const MEDIDA = { width: 1200, height: 800 }
const NADA = { top: 0, right: 0, bottom: 0, left: 0 }

describe('la cámara del lienzo', () => {
  it('el zoom cae siempre en un escalón, y el 100 % está a un paso', () => {
    expect(siguienteZoom(0.8, 1)).toBe(1)
    expect(siguienteZoom(1.25, -1)).toBe(1)
    // Viniendo de un valor cualquiera, sube al escalón siguiente y no a un múltiplo.
    expect(siguienteZoom(0.45, 1)).toBe(0.5)
    expect(siguienteZoom(0.45, -1)).toBe(0.4)
  })

  it('en las puntas se queda en el tope en vez de salirse', () => {
    expect(siguienteZoom(3, 1)).toBe(3)
    expect(siguienteZoom(0.3, -1)).toBe(0.3)
  })

  it('el viaje arranca rápido y llega frenando', () => {
    expect(curvaDelVuelo(0)).toBe(0)
    expect(curvaDelVuelo(1)).toBe(1)
    // A mitad de tiempo ya recorrió bastante más de la mitad del camino.
    expect(curvaDelVuelo(0.5)).toBeGreaterThan(0.9)
  })

  it('centrar deja el punto en el medio de lo que se ve', () => {
    const vista = vistaQueCentra({ x: 400, y: 300 }, MEDIDA, 1, NADA)
    expect(400 * vista.zoom + vista.x).toBeCloseTo(600, 5)
    expect(300 * vista.zoom + vista.y).toBeCloseTo(400, 5)
  })

  it('ir a ver una ventana nunca aleja ni pasa del 100 %', () => {
    const chica = { x: 0, y: 0, width: 300, height: 200 }
    // Estabas de cerca: traerla no te saca de donde estabas.
    expect(zoomParaRevelar(chica, MEDIDA, 2)).toBe(2)
    // Estabas lejos: acerca, pero sin pasar del tamaño real.
    expect(zoomParaRevelar(chica, MEDIDA, 0.4)).toBe(1)
  })

  it('una ventana chica vista de lejos se acerca hasta que entra con aire', () => {
    const grande = { x: 0, y: 0, width: 2000, height: 1400 }
    const zoom = zoomParaRevelar(grande, MEDIDA, 0.3)
    expect(zoom).toBeGreaterThan(0.3)
    expect(2000 * zoom).toBeLessThanOrEqual(MEDIDA.width - 80 + 0.001)
    expect(1400 * zoom).toBeLessThanOrEqual(MEDIDA.height - 80 + 0.001)
  })

  it('una ventana que no entra ni alejando se centra con el zoom que tenías', () => {
    // «Nunca aleja» le gana a «que entre entera», como en Deska: ir a ver algo enorme no te
    // puede tirar el plano al mínimo y dejarte sin saber dónde estás.
    const enorme = { x: 0, y: 0, width: 4000, height: 3000 }
    expect(zoomParaRevelar(enorme, MEDIDA, 0.3)).toBe(0.3)
  })

  it('el vuelo avisa que terminó en vez de quedarse pegado al final', () => {
    const desde = { x: 0, y: 0, zoom: 1 }
    const hasta = vistaQueCentra({ x: 2000, y: 0 }, MEDIDA, 1, NADA)
    const vuelo = prepararVuelo(desde, hasta, MEDIDA, { arranca: 1000, duracion: 200 })
    expect(vuelo.paso(1000)).toEqual(desde)
    const medio = vuelo.paso(1100)
    expect(medio).not.toBeNull()
    expect(medio?.x).toBeLessThan(desde.x)
    expect(vuelo.paso(1200)).toBeNull()
  })
})
