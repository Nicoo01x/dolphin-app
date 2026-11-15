import { describe, expect, it } from 'vitest'
import {
  acotarPosicionDeIsla,
  posicionDeIsla,
  posicionGuardadaDeIsla
} from './dolphin-isla-posicion'
import { superaUmbralDeArrastre } from '../../shared/dolphin-isla-types'

const pantalla = { id: 1, x: 0, y: 0, width: 1000, height: 800 }

describe('posición de la isla', () => {
  it('acota el movimiento al área visible', () => {
    expect(acotarPosicionDeIsla(-20, 900, 200, 80, pantalla)).toEqual({ x: 0, y: 720 })
  })

  it('permite cruzar de pantalla durante el arrastre y acota al soltar', () => {
    const segunda = { id: 2, x: 1000, y: 0, width: 1000, height: 800 }
    expect(acotarPosicionDeIsla(900, 40, 200, 80, segunda)).toEqual({ x: 1000, y: 40 })
  })

  it('conserva el clic debajo del umbral y arrastra desde cuatro píxeles', () => {
    expect(superaUmbralDeArrastre(2, 3)).toBe(false)
    expect(superaUmbralDeArrastre(4, 0)).toBe(true)
  })

  it('recupera centro y borde superior', () => {
    expect(posicionDeIsla(300, 40, 200, pantalla)).toEqual({
      centro: 400,
      arriba: 40,
      displayId: 1
    })
  })

  it('vuelve a la pantalla principal si falta la pantalla guardada o queda afuera', () => {
    const principal = { id: 2, x: 1000, y: 0, width: 1200, height: 900 }
    expect(posicionGuardadaDeIsla({ centro: 400, arriba: 40, displayId: 9 }, 200, 80, [pantalla], principal)).toEqual({
      x: 1500,
      y: 8,
      displayId: 2
    })
    expect(posicionGuardadaDeIsla({ centro: 990, arriba: 40, displayId: 1 }, 200, 80, [pantalla], principal)).toEqual({
      x: 1500,
      y: 8,
      displayId: 2
    })
  })
})
