import {
  COLUMNAS_DEL_TABLERO,
  type ColumnaDelTablero,
  type TarjetaDelTablero
} from '../../../../../shared/dolphin-tablero-types'

/** Dónde está cada columna en la pantalla, para saber sobre cuál se soltó una tarjeta. */
export type CajaDeColumna = {
  columna: ColumnaDelTablero
  izquierda: number
  derecha: number
  arriba: number
  abajo: number
}

/** Cuántos px hay que mover el puntero para que un toque sea un arrastre y no un clic. */
export const UMBRAL_DE_ARRASTRE = 5

export function empezoAArrastrar(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= UMBRAL_DE_ARRASTRE
}

/** La columna bajo el puntero, o null si se soltó fuera de todas. */
export function columnaBajo(
  x: number,
  y: number,
  cajas: readonly CajaDeColumna[]
): ColumnaDelTablero | null {
  return (
    cajas.find((c) => x >= c.izquierda && x <= c.derecha && y >= c.arriba && y <= c.abajo)
      ?.columna ?? null
  )
}

/** La columna de al lado (con el teclado, Alt+flecha), o null en los bordes del tablero. */
export function columnaVecina(columna: ColumnaDelTablero, paso: -1 | 1): ColumnaDelTablero | null {
  return COLUMNAS_DEL_TABLERO[COLUMNAS_DEL_TABLERO.indexOf(columna) + paso] ?? null
}

/**
 * El tablero con una tarjeta ya en otra columna, como lo va a escribir el núcleo: arriba de todo
 * (es lo último que se movió). Es lo que se dibuja mientras el núcleo contesta.
 */
export function conLaTarjetaMovida(
  tarjetas: readonly TarjetaDelTablero[],
  id: string,
  columna: ColumnaDelTablero,
  ahora: Date
): TarjetaDelTablero[] {
  return tarjetas.map((tarjeta) =>
    tarjeta.id === id && tarjeta.columna !== columna
      ? { ...tarjeta, columna, movida: ahora.toISOString() }
      : tarjeta
  )
}
