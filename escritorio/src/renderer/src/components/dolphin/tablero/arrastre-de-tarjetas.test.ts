import { describe, expect, it } from 'vitest'
import type { TarjetaDelTablero } from '../../../../../shared/dolphin-tablero-types'
import {
  columnaBajo,
  columnaVecina,
  conLaTarjetaMovida,
  empezoAArrastrar,
  type CajaDeColumna
} from './arrastre-de-tarjetas'

const cajas: CajaDeColumna[] = [
  { columna: 'ideas', izquierda: 0, derecha: 100, arriba: 0, abajo: 300 },
  { columna: 'para-hacer', izquierda: 108, derecha: 208, arriba: 0, abajo: 300 }
]

describe('arrastrar una tarjeta', () => {
  it('un toque que apenas se mueve sigue siendo un clic', () => {
    expect(empezoAArrastrar(2, 2)).toBe(false)
    expect(empezoAArrastrar(6, 0)).toBe(true)
  })

  it('sabe sobre qué columna se soltó, y que fuera de todas no es ninguna', () => {
    expect(columnaBajo(150, 20, cajas)).toBe('para-hacer')
    expect(columnaBajo(104, 20, cajas)).toBeNull()
    expect(columnaBajo(50, 400, cajas)).toBeNull()
  })

  it('con el teclado va a la columna de al lado y se frena en los bordes', () => {
    expect(columnaVecina('ideas', 1)).toBe('para-hacer')
    expect(columnaVecina('ideas', -1)).toBeNull()
    expect(columnaVecina('hecho', 1)).toBeNull()
    expect(columnaVecina('hecho', -1)).toBe('para-revisar')
  })

  it('mientras el núcleo contesta, la tarjeta ya está arriba de su columna nueva', () => {
    const tarjetas: TarjetaDelTablero[] = [
      { id: 'a', titulo: 'A', columna: 'ideas', tipo: 'idea', movida: '2026-01-01' },
      { id: 'b', titulo: 'B', columna: 'ideas', tipo: 'idea', movida: '2026-01-02' }
    ]
    const ahora = new Date('2026-11-11T12:00:00Z')
    const movidas = conLaTarjetaMovida(tarjetas, 'a', 'para-hacer', ahora)
    expect(movidas[0]).toMatchObject({ columna: 'para-hacer', movida: ahora.toISOString() })
    expect(movidas[1]).toBe(tarjetas[1])
    // No toca la lista que recibe.
    expect(tarjetas[0]?.columna).toBe('ideas')
  })
})
