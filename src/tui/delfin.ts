/**
 * El delfín de Dolphin saltando sobre el mar, en la terminal. Es el trazo del logo (el mismo de
 * resources/logo.svg) pasado a braille: cada carácter son 2×4 puntos, así que en 40 columnas entra un
 * delfín con detalle de verdad. Sin librerías: el trazo son líneas rectas y se rellena par-impar.
 *
 * `cuadroDelDelfin(t, ancho, alto)` devuelve las líneas de UN cuadro para el instante t (en ms).
 * Cada línea viene con su color por celda; quien dibuja decide si usa truecolor, 256 colores o nada.
 */

/** El trazo del logo (viewBox 0 0 462 370). */
const TRAZO =
  "M171.3 2.0L190.0 2.9L204.0 5.7L214.0 8.9L228.0 15.0L256.0 31.5L267.0 36.2L282.0 39.1L319.0 41.7L340.0 44.8L349.0 46.8L366.0 51.8L387.0 60.8L403.0 70.8L410.5 77.0L417.2 84.0L425.2 96.0L431.9 114.0L448.0 126.7L454.4 133.0L457.2 137.0L459.2 142.0L459.3 146.0L458.4 148.0L455.0 150.2L452.0 150.1L423.0 141.7L414.0 139.8L397.0 137.6L384.0 137.1L370.0 137.8L354.0 140.7L337.0 146.8L327.0 152.6L319.0 158.7L292.0 184.1L279.0 193.3L266.0 200.4L249.0 207.3L234.0 211.4L217.0 214.2L205.0 214.6L204.1 214.0L222.0 201.3L234.1 190.0L243.4 179.0L257.7 158.0L268.2 146.0L277.0 137.9L292.0 127.7L304.0 121.7L315.0 117.6L336.0 112.7L359.0 110.8L384.0 112.4L385.7 112.0L374.0 106.8L360.0 102.6L342.0 99.5L329.0 98.5L309.0 98.8L292.0 100.7L276.0 103.7L261.0 107.6L240.0 114.9L214.0 126.8L200.0 134.8L186.0 143.8L166.0 158.8L145.0 177.6L125.7 198.0L106.8 221.0L80.0 257.3L79.2 256.0L78.9 251.0L79.4 238.0L83.6 213.0L91.7 187.0L103.9 160.0L118.8 135.0L133.7 115.0L148.6 98.0L163.0 83.8L181.1 68.0L184.5 63.0L185.3 57.0L183.2 50.0L178.5 41.0L173.3 34.0L168.0 28.0L161.0 21.7L151.0 14.9L141.3 10.0L140.8 9.0L145.0 6.8L152.0 4.6L162.0 2.7ZM127.3 225.0L128.0 224.4L128.6 225.0L120.6 239.0L114.6 254.0L111.8 268.0L111.8 276.0L113.6 285.0L116.5 292.0L119.8 298.0L137.2 324.0L144.2 339.0L147.2 351.0L147.7 356.0L147.4 364.0L146.0 367.9L133.2 351.0L119.0 338.7L111.0 333.7L100.0 328.6L90.0 325.7L83.0 324.6L68.0 324.8L57.0 326.9L45.0 330.7L35.0 334.9L24.0 340.6L13.0 347.7L3.0 355.2L2.1 355.0L1.8 350.0L2.6 344.0L6.7 332.0L14.7 318.0L25.0 305.2L36.0 294.8L44.0 288.8L73.0 271.3L87.0 261.3L119.0 231.6Z";

export type Punto = readonly [number, number];

/** Los polígonos del trazo: cada `M` empieza uno. */
export function poligonosDelTrazo(trazo: string): Punto[][] {
  const poligonos: Punto[][] = [];
  const re = /([MLZ])\s*(-?[\d.]+)?[\s,]*(-?[\d.]+)?/gi;
  let actual: Punto[] | null = null;
  for (const m of trazo.matchAll(re)) {
    const comando = m[1]!.toUpperCase();
    if (comando === "Z") {
      actual = null;
      continue;
    }
    const x = Number(m[2]);
    const y = Number(m[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (comando === "M" || !actual) {
      actual = [];
      poligonos.push(actual);
    }
    actual.push([x, y]);
  }
  return poligonos.filter((p) => p.length >= 3);
}

/** Par-impar, como el `fill-rule="evenodd"` del SVG: los huecos (el ojo, la aleta) quedan huecos. */
export function adentro(poligonos: readonly Punto[][], x: number, y: number): boolean {
  let dentro = false;
  for (const p of poligonos) {
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i]!;
      const [xj, yj] = p[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  }
  return dentro;
}

// Bits de braille por posición (columna 0..1, fila 0..3) dentro de un carácter, desde U+2800.
const BIT = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
] as const;

/** Un lienzo de puntos que se vuelve braille: ancho×alto en caracteres, (2·ancho)×(4·alto) en puntos. */
export class Lienzo {
  readonly bits: Uint8Array;
  readonly tinta: Uint8Array;
  constructor(
    readonly ancho: number,
    readonly alto: number,
  ) {
    this.bits = new Uint8Array(ancho * alto);
    this.tinta = new Uint8Array(ancho * alto);
  }
  /** Prende un punto; `tinta` dice de qué es (0 nada, 1 mar, 2 espuma, 3 delfín). Gana la tinta más alta. */
  punto(px: number, py: number, tinta: number): void {
    const x = Math.floor(px);
    const y = Math.floor(py);
    if (x < 0 || y < 0 || x >= this.ancho * 2 || y >= this.alto * 4) return;
    const celda = Math.floor(y / 4) * this.ancho + Math.floor(x / 2);
    this.bits[celda]! |= BIT[y % 4]![x % 2]!;
    if (tinta > this.tinta[celda]!) this.tinta[celda] = tinta;
  }
  caracter(celda: number): string {
    const b = this.bits[celda]!;
    return b === 0 ? " " : String.fromCharCode(0x2800 + b);
  }
}

const POLIGONOS = poligonosDelTrazo(TRAZO);
const CAJA = { ancho: 462, alto: 370 };

/** El logo listo para rasterizar: sus polígonos (par-impar) y su caja (el viewBox). */
export const LOGO = { poligonos: POLIGONOS, ...CAJA } as const;

export interface Celda {
  caracter: string;
  /** 0 nada, 1 mar, 2 espuma, 3 delfín. */
  tinta: number;
}

/** Dibuja el delfín rotado y escalado con su centro en (cx, cy), en puntos del lienzo. */
function dibujarDelfin(lienzo: Lienzo, cx: number, cy: number, escala: number, angulo: number): void {
  const cos = Math.cos(angulo);
  const sin = Math.sin(angulo);
  const radio = (Math.max(CAJA.ancho, CAJA.alto) * escala) / 2 + 2;
  for (let py = Math.floor(cy - radio); py <= cy + radio; py++) {
    for (let px = Math.floor(cx - radio); px <= cx + radio; px++) {
      // Del punto del lienzo al punto del logo: girar al revés y escalar. Los puntos de braille son
      // cuadrados en pantalla (2×4 en una celda que es el doble de alta que de ancha): sin corrección.
      const dx = (px - cx) / escala;
      const dy = (py - cy) / escala;
      const lx = dx * cos + dy * sin + CAJA.ancho / 2;
      const ly = -dx * sin + dy * cos + CAJA.alto / 2;
      if (lx >= 0 && ly >= 0 && lx <= CAJA.ancho && ly <= CAJA.alto && adentro(POLIGONOS, lx, ly)) lienzo.punto(px, py, 3);
    }
  }
}

/**
 * Un cuadro: el mar ondulando abajo, el delfín saltando en arco de izquierda a derecha (con el
 * cuerpo inclinado según va subiendo o bajando) y espuma donde sale y donde entra al agua.
 * El ciclo dura `periodo` ms y se repite.
 */
export function cuadroDelDelfin(t: number, ancho: number, alto: number, periodo = 4200): Celda[][] {
  const lienzo = new Lienzo(ancho, alto);
  const W = ancho * 2;
  const H = alto * 4;
  const nivel = H * 0.78;

  // El mar: tres olas sumadas, que corren hacia la izquierda.
  const ola = (x: number) =>
    nivel + Math.sin(x * 0.11 - t * 0.004) * 1.6 + Math.sin(x * 0.047 + t * 0.0021) * 2.2 + Math.sin(x * 0.23 - t * 0.007) * 0.6;
  for (let x = 0; x < W; x++) {
    const y = ola(x);
    lienzo.punto(x, y, 2);
    // Debajo de la cresta, el agua se va raleando: puntos cada vez más separados.
    for (let k = 1; y + k * 2 < H; k++) if ((x + k * 3 + Math.floor(t / 180)) % (2 + k) === 0) lienzo.punto(x, y + k * 2, 1);
  }

  // El salto: una parábola sobre el agua; afuera del agua, el delfín.
  const fase = (t % periodo) / periodo;
  const x = -W * 0.15 + fase * W * 1.3;
  const alturaDelSalto = H * 0.42;
  const escala = Math.min(W / CAJA.ancho, H / CAJA.alto) * 0.5;
  const yArco = nivel - Math.sin(Math.PI * fase) * alturaDelSalto + CAJA.alto * escala * 0.15;
  // La nariz apunta hacia donde va: la tangente del arco (sube al principio, baja al final).
  const vy = -Math.PI * alturaDelSalto * Math.cos(Math.PI * fase);
  const angulo = Math.atan2(vy, W * 1.3) * 0.75;
  dibujarDelfin(lienzo, x, yArco, escala, angulo);

  // Espuma: un abanico de gotas donde salta (al principio) y donde entra (al final).
  const gotas = (cx: number, fuerza: number) => {
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.15 + (0.7 * i) / 13);
      const r = fuerza * (0.6 + ((i * 37) % 10) / 25);
      lienzo.punto(cx + Math.cos(a) * r * 1.4, nivel - Math.sin(a) * r, 2);
    }
  };
  if (fase < 0.18) gotas(-W * 0.15 + W * 0.17, 10 * (1 - fase / 0.18));
  if (fase > 0.8) gotas(-W * 0.15 + W * 1.13, 10 * ((fase - 0.8) / 0.2));

  const filas: Celda[][] = [];
  for (let fila = 0; fila < alto; fila++) {
    const celdas: Celda[] = [];
    for (let col = 0; col < ancho; col++) {
      const celda = fila * ancho + col;
      celdas.push({ caracter: lienzo.caracter(celda), tinta: lienzo.tinta[celda]! });
    }
    filas.push(celdas);
  }
  return filas;
}

/** Colores del mar y del delfín: truecolor, del azul profundo a la espuma; el delfín, casi blanco. */
const PALETA: Record<number, readonly [number, number, number]> = {
  1: [36, 112, 168],
  2: [140, 214, 238],
  3: [236, 246, 252],
};

/** El cuadro como texto con color (o sin color), listo para escribir en la terminal. */
export function delfinComoTexto(t: number, ancho: number, alto: number, color: boolean): string[] {
  return cuadroDelDelfin(t, ancho, alto).map((fila, i) => {
    if (!color) return fila.map((c) => c.caracter).join("");
    let salida = "";
    let ultimo = -1;
    for (const c of fila) {
      if (c.tinta !== ultimo) {
        const rgb = PALETA[c.tinta];
        // El mar se oscurece hacia abajo: profundidad con un degradé por fila.
        const oscuro = c.tinta === 1 ? 1 - i / (alto * 2.2) : 1;
        salida += rgb ? `\x1b[38;2;${Math.round(rgb[0] * oscuro)};${Math.round(rgb[1] * oscuro)};${Math.round(rgb[2] * oscuro)}m` : "\x1b[0m";
        ultimo = c.tinta;
      }
      salida += c.caracter;
    }
    return `${salida}\x1b[0m`;
  });
}
