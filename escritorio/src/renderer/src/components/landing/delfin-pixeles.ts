/**
 * El delfín en píxeles, el mismo que el de la web (`web/src/lib/pixeles.ts`).
 *
 * Es una grilla de caracteres: una letra por color, un punto para el vacío. Se escribe así y no
 * como imagen porque pesa nada, se recolorea sin exportar de nuevo y se lee en el diff: cambiar
 * un píxel es cambiar una letra.
 *
 * El dibujo lo generó `web/scripts/delfin-pixel.mjs` a partir de su geometría (elipses y
 * triángulos de la silueta) y no a mano: a mano, en una grilla chica, todas las curvas de un
 * delfín —el lomo, el melón, la dorsal que cae hacia atrás— salen cuñas rectas y el animal
 * termina pareciendo un tiburón. Si hay que cambiarle la forma, se corre de nuevo ese script y
 * se pega el resultado en los dos lados.
 */

/** Las tres tintas del dibujo: lomo, panza y ojo. */
export type Letra = 'o' | 'c' | 'e'

/** 40×17 · generado por `web/scripts/delfin-pixel.mjs`. Mira a la derecha. */
export const DELFIN: readonly string[] = [
  '...............o........................',
  '...............oo.......................',
  '...............ooo......................',
  '...............oooo.....................',
  '......oo.......ooooooooooooo............',
  '.....ooo......ooooooooooooooooooo.......',
  '....oooo...ooooooooooooooooooooooo......',
  '...oooo..oooooooooooooooooooooooooo.....',
  '..ooooooooooooooooooooooooooooooooo.....',
  '..oooooooooooooooooooooooooooooeccc.....',
  '....ooooooooooooooooocccccccccccccccc...',
  '..o..oooooocccccccccccccccccccccccc.....',
  '..ccc..cccccccccccccccccccccccccc.......',
  '..cccc..ccccccccccccccccccc.............',
  '...cccc....cccccccccccc.................',
  '....cccc................................',
  '.....ccc................................'
]

export const ANCHO_DELFIN = Math.max(...DELFIN.map((fila) => fila.length))
export const ALTO_DELFIN = DELFIN.length

export type PixelDelDibujo = { readonly x: number; readonly y: number; readonly letra: Letra }

/** Los píxeles encendidos de un dibujo, listos para pintar. */
export function pixelesDe(dibujo: readonly string[]): readonly PixelDelDibujo[] {
  const salida: PixelDelDibujo[] = []
  dibujo.forEach((fila, y) => {
    ;[...fila].forEach((caracter, x) => {
      if (caracter === 'o' || caracter === 'c' || caracter === 'e') {
        salida.push({ x, y, letra: caracter })
      }
    })
  })
  return salida
}

export const PIXELES_DEL_DELFIN = pixelesDe(DELFIN)
