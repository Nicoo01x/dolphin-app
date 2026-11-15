/**
 * Los dibujos en píxeles del sitio.
 *
 * Cada uno es una grilla de caracteres: una letra por color, un punto para el vacío. Se escriben
 * así y no como imágenes porque pesan nada, se recolorean con la paleta del sitio sin exportar de
 * nuevo y se leen en el diff: cambiar un píxel es cambiar una letra.
 *
 * El delfín lo generó `scripts/delfin-pixel.mjs` a partir de su geometría (elipses y triángulos de
 * la silueta) y no a mano: a mano, en una grilla chica, todas las curvas de un delfín —el lomo, el
 * melón, la dorsal que cae hacia atrás— salen cuñas rectas y el animal termina pareciendo un
 * tiburón. Si hay que cambiarle la forma, se cambian los números del script y se vuelve a correr.
 */

/** Los colores de cada letra. Son los del sitio, no una paleta aparte. */
export const TINTA = {
  /** El lomo. */
  o: "var(--color-marino, #1b6ca8)",
  /** La panza y la espuma. */
  c: "var(--color-electrico, #19b9ff)",
  /** El ojo: el fondo de la página, así es un hueco y no una mancha. */
  e: "var(--color-noche, #0b0e1a)",
} as const;

export type Letra = keyof typeof TINTA;

/** 40×17 · generado por scripts/delfin-pixel.mjs. Mira a la derecha. */
export const DELFIN: readonly string[] = [
  "...............o........................",
  "...............oo.......................",
  "...............ooo......................",
  "...............oooo.....................",
  "......oo.......ooooooooooooo............",
  ".....ooo......ooooooooooooooooooo.......",
  "....oooo...ooooooooooooooooooooooo......",
  "...oooo..oooooooooooooooooooooooooo.....",
  "..ooooooooooooooooooooooooooooooooo.....",
  "..oooooooooooooooooooooooooooooeccc.....",
  "....ooooooooooooooooocccccccccccccccc...",
  "..o..oooooocccccccccccccccccccccccc.....",
  "..ccc..cccccccccccccccccccccccccc.......",
  "..cccc..ccccccccccccccccccc.............",
  "...cccc....cccccccccccc.................",
  "....cccc................................",
  ".....ccc................................",
];

export const ANCHO_DELFIN = Math.max(...DELFIN.map((f) => f.length));
export const ALTO_DELFIN = DELFIN.length;

/** Los píxeles encendidos de un dibujo, ya listos para pintar: {x, y, letra}. */
export function pixelesDe(dibujo: readonly string[]): readonly { readonly x: number; readonly y: number; readonly letra: Letra }[] {
  const salida: { x: number; y: number; letra: Letra }[] = [];
  dibujo.forEach((fila, y) => {
    [...fila].forEach((ch, x) => {
      if (ch in TINTA) salida.push({ x, y, letra: ch as Letra });
    });
  });
  return salida;
}

export const PIXELES_DEL_DELFIN = pixelesDe(DELFIN);
