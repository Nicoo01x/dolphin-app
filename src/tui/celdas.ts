/**
 * La pantalla como una grilla de celdas, al estilo de ratatui: se dibuja todo en un búfer (el mar
 * de fondo, después los paneles encima, como capas) y a la terminal solo viaja lo que cambió desde
 * el cuadro anterior. Así un fondo animado a 30 cuadros no parpadea ni satura la terminal.
 *
 * Una celda es un carácter con su color de letra y de fondo. Los caracteres anchos (CJK, emojis)
 * ocupan dos celdas: la segunda queda vacía («continuación») y no se escribe.
 */

export type Rgb = readonly [number, number, number];

export interface Estilo {
  readonly fg?: Rgb | undefined;
  readonly bg?: Rgb | undefined;
  readonly negrita?: boolean;
  readonly tenue?: boolean;
  readonly subrayado?: boolean;
  readonly cursiva?: boolean;
  readonly tachado?: boolean;
}

export interface Celda {
  ch: string;
  fg: Rgb | null;
  bg: Rgb | null;
  negrita: boolean;
  tenue: boolean;
  subrayado: boolean;
  cursiva: boolean;
  tachado: boolean;
}

/** Truecolor, 256 colores o nada (un log, NO_COLOR). */
export type Profundidad = "truecolor" | "256" | "ninguna";

const celdaVacia = (): Celda => ({ ch: " ", fg: null, bg: null, negrita: false, tenue: false, subrayado: false, cursiva: false, tachado: false });

/** Cuántas columnas ocupa un carácter: 0 (combinante), 1 o 2 (ancho del este asiático y emojis). */
export function anchoDe(ch: string): 0 | 1 | 2 {
  const c = ch.codePointAt(0) ?? 32;
  if (c === 0 || (c >= 0x300 && c <= 0x36f) || c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f)) return 0;
  if (
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf && c !== 0x303f) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe4f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6) ||
    (c >= 0x1f300 && c <= 0x1faff) ||
    (c >= 0x20000 && c <= 0x3fffd)
  )
    return 2;
  return 1;
}

/**
 * Un texto que se puede escribir en la terminal: sin secuencias de escape (colores, OSC como el 52 que
 * escribe el portapapeles) y con los caracteres de control como espacios. Lo que llega de un agente, de
 * un archivo leído o de la salida de un test no puede mover el cursor ni mandarle órdenes a la terminal.
 */
export function sinControl(texto: string): string {
  return texto
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, "")
    .replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "")
    .replace(/[\x00-\x1f\x7f\x9b]/g, " ");
}

/** Columnas visibles de un texto sin secuencias de escape. */
export function anchoDeTexto(texto: string): number {
  let total = 0;
  for (const ch of texto) total += anchoDe(ch);
  return total;
}

/** Recorta a `ancho` columnas, con «…» si no entra. */
export function recortar(texto: string, ancho: number): string {
  if (ancho <= 0) return "";
  if (anchoDeTexto(texto) <= ancho) return texto;
  let salida = "";
  let usado = 0;
  for (const ch of texto) {
    const a = anchoDe(ch);
    if (usado + a > ancho - 1) break;
    salida += ch;
    usado += a;
  }
  return `${salida}…`;
}

/** Corta un texto en renglones de `ancho` columnas, por palabras. */
export function partirEnRenglones(texto: string, ancho: number): string[] {
  const renglones: string[] = [];
  for (const parrafo of texto.split("\n")) {
    let actual = "";
    for (const palabra of parrafo.split(/(\s+)/)) {
      if (!palabra) continue;
      if (anchoDeTexto(actual + palabra) <= ancho) {
        actual += palabra;
        continue;
      }
      if (actual.trim()) renglones.push(actual.trimEnd());
      actual = palabra.trimStart();
      // Una palabra más larga que el renglón entero se corta a la fuerza.
      while (anchoDeTexto(actual) > ancho) {
        const pedazo = [...actual].slice(0, ancho).join("");
        renglones.push(pedazo);
        actual = actual.slice(pedazo.length);
      }
    }
    renglones.push(actual.trimEnd());
  }
  return renglones;
}

export class Bufer {
  readonly celdas: Celda[];
  constructor(
    readonly ancho: number,
    readonly alto: number,
  ) {
    this.celdas = Array.from({ length: ancho * alto }, celdaVacia);
  }

  celda(x: number, y: number): Celda | undefined {
    if (x < 0 || y < 0 || x >= this.ancho || y >= this.alto) return undefined;
    return this.celdas[y * this.ancho + x];
  }

  /** Un carácter con su estilo. Sin `bg`, queda el fondo que ya había (así el texto flota sobre el mar). */
  poner(x: number, y: number, ch: string, estilo: Estilo = {}): void {
    const celda = this.celda(x, y);
    if (!celda) return;
    celda.ch = ch;
    celda.fg = estilo.fg ?? null;
    if (estilo.bg) celda.bg = estilo.bg;
    celda.negrita = estilo.negrita ?? false;
    celda.tenue = estilo.tenue ?? false;
    celda.subrayado = estilo.subrayado ?? false;
    celda.cursiva = estilo.cursiva ?? false;
    celda.tachado = estilo.tachado ?? false;
  }

  /** Escribe un texto desde (x, y) sin pasarse de `max` columnas. Devuelve cuántas usó. */
  texto(x: number, y: number, texto: string, estilo: Estilo = {}, max = this.ancho - x): number {
    let col = 0;
    for (const ch of sinControl(texto)) {
      const a = anchoDe(ch);
      if (a === 0) continue;
      if (col + a > max) break;
      this.poner(x + col, y, ch, estilo);
      if (a === 2) this.poner(x + col + 1, y, "", estilo);
      col += a;
    }
    return col;
  }

  /** Pinta el fondo de un rectángulo (y borra lo que había escrito). */
  rellenar(x: number, y: number, w: number, h: number, bg: Rgb | null): void {
    for (let fy = y; fy < y + h; fy++) {
      for (let fx = x; fx < x + w; fx++) {
        const celda = this.celda(fx, fy);
        if (!celda) continue;
        Object.assign(celda, celdaVacia(), { bg });
      }
    }
  }

  /** Mezcla el fondo de un rectángulo hacia `hacia` (0 nada, 1 todo): un velo sobre el mar. */
  velo(x: number, y: number, w: number, h: number, hacia: Rgb, cuanto: number): void {
    for (let fy = y; fy < y + h; fy++) {
      for (let fx = x; fx < x + w; fx++) {
        const celda = this.celda(fx, fy);
        if (!celda) continue;
        if (celda.bg) celda.bg = mezclar(celda.bg, hacia, cuanto);
        if (celda.fg) celda.fg = mezclar(celda.fg, hacia, cuanto);
      }
    }
  }

  /** Una caja con esquinas redondeadas y el título sobre el borde de arriba. */
  caja(x: number, y: number, w: number, h: number, borde: Rgb, opciones: { titulo?: string; colorTitulo?: Rgb; fondo?: Rgb } = {}): void {
    if (w < 2 || h < 2) return;
    if (opciones.fondo) this.rellenar(x, y, w, h, opciones.fondo);
    const e = { fg: borde };
    this.poner(x, y, "╭", e);
    this.poner(x + w - 1, y, "╮", e);
    this.poner(x, y + h - 1, "╰", e);
    this.poner(x + w - 1, y + h - 1, "╯", e);
    for (let i = 1; i < w - 1; i++) {
      this.poner(x + i, y, "─", e);
      this.poner(x + i, y + h - 1, "─", e);
    }
    for (let j = 1; j < h - 1; j++) {
      this.poner(x, y + j, "│", e);
      this.poner(x + w - 1, y + j, "│", e);
    }
    if (opciones.titulo) this.texto(x + 2, y, ` ${recortar(opciones.titulo, w - 6)} `, { fg: opciones.colorTitulo ?? borde, negrita: true });
  }

  /** El búfer como texto plano, renglón por renglón (para tests y para imprimir el último cuadro). */
  comoTexto(): string[] {
    const renglones: string[] = [];
    for (let y = 0; y < this.alto; y++) {
      let r = "";
      for (let x = 0; x < this.ancho; x++) r += this.celdas[y * this.ancho + x]!.ch;
      renglones.push(r.trimEnd());
    }
    return renglones;
  }
}

export function mezclar(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}

/** El índice de la paleta de 256 colores más cercano (el cubo 6×6×6 o la rampa de grises). */
export function a256(rgb: Rgb): number {
  const [r, g, b] = rgb;
  if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10) {
    if (r < 8) return 16;
    if (r > 238) return 231;
    return 232 + Math.round(((r - 8) / 230) * 23);
  }
  const nivel = (v: number) => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.round((v - 35) / 40)));
  return 16 + 36 * nivel(r) + 6 * nivel(g) + nivel(b);
}

function color(base: 38 | 48, rgb: Rgb, profundidad: Profundidad): string {
  if (profundidad === "truecolor") return `${base};2;${rgb[0]};${rgb[1]};${rgb[2]}`;
  return profundidad === "256" ? `${base};5;${a256(rgb)}` : "";
}

const mismoColor = (a: Rgb | null, b: Rgb | null): boolean => a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

/**
 * El SGR para pasar del estilo `antes` al de `celda`. Si solo cambió el color (lo normal en el
 * mar, celda a celda) va solo el color: un reinicio completo por celda triplicaba los bytes.
 */
function sgr(antes: Celda | null, celda: Celda, profundidad: Profundidad): string {
  const mismosAtributos = antes && antes.negrita === celda.negrita && antes.tenue === celda.tenue && antes.subrayado === celda.subrayado && antes.cursiva === celda.cursiva && antes.tachado === celda.tachado;
  if (mismosAtributos && (celda.fg || !antes.fg) && (celda.bg || !antes.bg)) {
    const partes: string[] = [];
    if (celda.fg && !mismoColor(antes.fg, celda.fg)) partes.push(color(38, celda.fg, profundidad));
    if (celda.bg && !mismoColor(antes.bg, celda.bg)) partes.push(color(48, celda.bg, profundidad));
    const utiles = partes.filter(Boolean);
    return utiles.length > 0 ? `\x1b[${utiles.join(";")}m` : "";
  }
  const partes = ["0"];
  if (celda.negrita) partes.push("1");
  if (celda.tenue) partes.push("2");
  if (celda.cursiva) partes.push("3");
  if (celda.subrayado) partes.push("4");
  if (celda.tachado) partes.push("9");
  if (celda.fg) partes.push(color(38, celda.fg, profundidad));
  if (celda.bg) partes.push(color(48, celda.bg, profundidad));
  return `\x1b[${partes.filter(Boolean).join(";")}m`;
}

const igual = (a: Celda, b: Celda): boolean =>
  a.ch === b.ch && a.negrita === b.negrita && a.tenue === b.tenue && a.subrayado === b.subrayado && a.cursiva === b.cursiva && a.tachado === b.tachado && mismoColor(a.fg, b.fg) && mismoColor(a.bg, b.bg);

/**
 * Lo que hay que mandarle a la terminal para pasar de `antes` a `ahora`: solo las celdas que
 * cambiaron, moviendo el cursor cuando hay un salto. Sin `antes` (o si cambió el tamaño), todo.
 */
export function diferencia(antes: Bufer | null, ahora: Bufer, profundidad: Profundidad): string {
  const todo = !antes || antes.ancho !== ahora.ancho || antes.alto !== ahora.alto;
  let salida = todo ? "\x1b[0m\x1b[2J" : "";
  let estiloActual: Celda | null = null;
  let cursorX = -1;
  let cursorY = -1;
  for (let y = 0; y < ahora.alto; y++) {
    for (let x = 0; x < ahora.ancho; x++) {
      const i = y * ahora.ancho + x;
      const celda = ahora.celdas[i]!;
      if (celda.ch === "") continue;
      if (!todo && igual(antes!.celdas[i]!, celda)) continue;
      if (cursorX !== x || cursorY !== y) salida += `\x1b[${y + 1};${x + 1}H`;
      salida += sgr(estiloActual, celda, profundidad);
      estiloActual = celda;
      salida += celda.ch;
      cursorX = x + anchoDe(celda.ch);
      cursorY = y;
    }
  }
  return salida + (salida ? "\x1b[0m" : "");
}

/** Qué colores entiende la terminal. Windows Terminal (WT_SESSION) siempre dibuja truecolor. */
export function profundidadDe(entorno: NodeJS.ProcessEnv, salida: { getColorDepth?: () => number; isTTY?: boolean }): Profundidad {
  if (entorno.NO_COLOR) return "ninguna";
  if (entorno.WT_SESSION || /truecolor|24bit/i.test(entorno.COLORTERM ?? "")) return "truecolor";
  const bits = salida.getColorDepth?.() ?? (salida.isTTY ? 8 : 1);
  return bits >= 24 ? "truecolor" : bits >= 8 ? "256" : "ninguna";
}
