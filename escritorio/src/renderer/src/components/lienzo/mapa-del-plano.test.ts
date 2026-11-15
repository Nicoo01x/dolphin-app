import { describe, expect, it } from 'vitest'
import { alMinimapa, desdeElMinimapa, loQueEntra, proyeccionDelMinimapa } from './mapa-del-plano'

const CAJA = { width: 142, height: 88 }
const VENTANA = { x: 0, y: 0, width: 400, height: 300 }

describe('el minimapa', () => {
  it('mete en el mapa también lo que se está viendo, no solo las ventanas', () => {
    // Si no, al alejarte de todas las ventanas el rectángulo de la vista se iría afuera del
    // mapa, que es justo cuando uno lo mira para volver.
    const lejos = { x: 4000, y: 4000, width: 1200, height: 800 }
    const todo = loQueEntra([VENTANA], lejos)
    expect(todo.x).toBe(-40)
    expect(todo.x + todo.width).toBe(5240)
  })

  it('el mapa queda centrado y una ventana cae donde corresponde', () => {
    const mundo = loQueEntra([VENTANA], VENTANA)
    const p = proyeccionDelMinimapa(mundo, CAJA)
    const puesta = alMinimapa(VENTANA, p)
    // Sobra a lo ancho o a lo alto, pero el contenido queda con el mismo aire de los dos lados.
    expect(puesta.x - p.ox).toBeCloseTo(40 * p.escala, 5)
    expect(puesta.width).toBeCloseTo(400 * p.escala, 5)
    expect(puesta.x + puesta.width).toBeLessThanOrEqual(CAJA.width + 0.001)
    expect(puesta.y + puesta.height).toBeLessThanOrEqual(CAJA.height + 0.001)
  })

  it('una ventana chiquita vista de lejos igual se ve: dos píxeles mínimo', () => {
    const mundo = loQueEntra([VENTANA], { x: 0, y: 0, width: 40000, height: 30000 })
    const p = proyeccionDelMinimapa(mundo, CAJA)
    const puesta = alMinimapa({ x: 0, y: 0, width: 10, height: 10 }, p)
    expect(puesta.width).toBe(2)
    expect(puesta.height).toBe(2)
  })

  it('el clic vuelve al punto del plano del que salió', () => {
    const mundo = loQueEntra([VENTANA], VENTANA)
    const p = proyeccionDelMinimapa(mundo, CAJA)
    const enElPlano = { x: 180, y: 120 }
    const enElMapa = alMinimapa({ ...enElPlano, width: 0, height: 0 }, p)
    const vuelta = desdeElMinimapa({ x: enElMapa.x, y: enElMapa.y }, p)
    expect(vuelta.x).toBeCloseTo(enElPlano.x, 5)
    expect(vuelta.y).toBeCloseTo(enElPlano.y, 5)
  })
})
