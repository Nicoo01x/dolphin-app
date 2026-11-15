import { anchoDeTexto, mezclar, recortar, type Bufer, type Estilo, type Rgb } from "./celdas.js";

/**
 * Los colores de la app.
 *
 * La cáscara tiene CINCO niveles y no uno: borde, texto, atenuado, marca y marca viva. Medido
 * contra el CLI de Qoder (`docs/tui-de-qoder.md`), esa es toda la diferencia entre una pantalla
 * que se lee de un vistazo y una pareja: la suya pide cinco colores en la pantalla de inicio y la
 * nuestra pedía uno, repetido 813 veces, así que nada destacaba sobre nada.
 *
 * La marca es el azul del mar —el mismo `#19b9ff` del tema Mar— y no un gris: es lo que dice de
 * quién es la terminal sin escribir el nombre. Adentro, lo que pasa sigue teniendo color como en
 * Claude Code: verde pasó, rojo falló, ámbar ojo, naranja el agente trabajando, violeta los
 * comandos y un color por compañero.
 */
export const T = {
  fondo: [16, 16, 16] as Rgb,
  panel: [22, 22, 22] as Rgb,
  panelAlto: [32, 32, 32] as Rgb,
  borde: [46, 46, 46] as Rgb,
  foco: [150, 150, 150] as Rgb,
  texto: [222, 222, 222] as Rgb,
  suave: [146, 146, 146] as Rgb,
  tenue: [92, 92, 92] as Rgb,
  acento: [240, 240, 240] as Rgb,
  claro: [255, 255, 255] as Rgb,
  /** El azul del mar: el logo, el título de una caja, lo que es de Dolphin. */
  marca: [25, 185, 255] as Rgb,
  /** El mismo azul, más vivo: sólo lo elegido ahora —el `❯` de una lista—, nunca una superficie. */
  marcaViva: [94, 205, 255] as Rgb,
  linea: [30, 30, 30] as Rgb,
  pastilla: [40, 40, 40] as Rgb,
  amarillo: [230, 190, 92] as Rgb,
  verde: [92, 200, 120] as Rgb,
  rojo: [240, 110, 110] as Rgb,
  naranja: [218, 122, 84] as Rgb,
  naranjaTenue: [120, 72, 54] as Rgb,
  violeta: [178, 148, 255] as Rgb,
  azul: [104, 170, 240] as Rgb,
  cian: [94, 200, 210] as Rgb,
  rosa: [236, 120, 180] as Rgb,
} as const;

export type Tono = "normal" | "bien" | "mal" | "aviso" | "suave";

export const colorDeTono = (tono: Tono | undefined): Rgb =>
  tono === "bien" ? T.verde : tono === "mal" ? T.rojo : tono === "aviso" ? T.amarillo : tono === "suave" ? T.suave : T.texto;

/** Cada compañero del equipo con su color, por rol (el segundo «ux» es «ux2» y usa el mismo). */
const COLOR_DE: Record<string, Rgb> = {
  ux: T.violeta,
  ui: T.violeta,
  backend: T.azul,
  api: T.azul,
  tests: T.cian,
  docs: T.rosa,
  datos: [150, 170, 255] as Rgb,
  infra: T.rosa,
};
export const colorDeDueno = (dueno: string): Rgb => COLOR_DE[dueno.replace(/\d+$/, "")] ?? T.cian;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Algo que se puede tocar con el mouse. */
export interface Zona extends Rect {
  readonly accion: () => void;
}

/** Un panel: un tono más claro que el fondo, con borde fino (más claro si tiene el foco). */
export function panel(b: Bufer, r: Rect, opciones: { titulo?: string; foco?: boolean; opaco?: boolean } = {}): Rect {
  b.rellenar(r.x, r.y, r.w, r.h, T.panel);
  b.caja(r.x, r.y, r.w, r.h, opciones.foco ? T.foco : T.borde, {
    ...(opciones.titulo ? { titulo: opciones.titulo } : {}),
    colorTitulo: opciones.foco ? T.foco : T.suave,
  });
  return { x: r.x + 2, y: r.y + 1, w: r.w - 4, h: r.h - 2 };
}

/** Una barra de progreso con octavos de bloque: ▏▎▍▌▋▊▉█. */
export function barra(b: Bufer, x: number, y: number, ancho: number, valor: number, color: Rgb): void {
  const OCTAVOS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
  const total = Math.max(0, Math.min(1, valor)) * ancho * 8;
  const llenos = Math.floor(total / 8);
  const resto = Math.floor(total % 8);
  for (let i = 0; i < ancho; i++) {
    const ch = i < llenos ? "█" : i === llenos ? OCTAVOS[resto] || " " : " ";
    b.poner(x + i, y, ch, { fg: color, bg: T.panelAlto });
  }
}

/** Un texto con brillo que lo recorre (el «estoy trabajando»): una banda coseno que avanza. */
export function brillo(b: Bufer, x: number, y: number, texto: string, t: number, base: Rgb = T.tenue, alto: Rgb = T.claro): number {
  const letras = [...texto];
  const pos = ((t / 45) % (letras.length + 24)) - 12;
  letras.forEach((ch, i) => {
    const k = Math.max(0, Math.cos(Math.min(Math.PI, Math.abs(i - pos) / 3.2)));
    b.poner(x + i, y, ch, { fg: mezclar(base, alto, k) });
  });
  return letras.length;
}

const GIRO = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
export const giro = (t: number): string => GIRO[Math.floor(t / 110) % GIRO.length]!;

/** Una pastilla (chip): texto con fondo, para estados y la pestaña activa. */
export function pastilla(b: Bufer, x: number, y: number, texto: string, fg: Rgb, bg: Rgb, negrita = false): number {
  const contenido = ` ${texto} `;
  return b.texto(x, y, contenido, { fg, bg, negrita });
}

/** Renglones de texto con recorte, desde un desplazamiento. Devuelve cuántos dibujó. */
export function renglones(b: Bufer, r: Rect, lineas: readonly { texto: string; estilo?: Estilo }[], desde = 0): number {
  let n = 0;
  for (let i = desde; i < lineas.length && n < r.h; i++, n++) {
    const l = lineas[i]!;
    b.texto(r.x, r.y + n, recortar(l.texto, r.w), l.estilo ?? { fg: T.texto });
  }
  return n;
}

/** El pie de atajos: la tecla en negrita, lo que hace en tenue, separados por «·». */
export function atajos(b: Bufer, x: number, y: number, ancho: number, lista: readonly [string, string][]): void {
  let col = x;
  for (const [i, [tecla, que]] of lista.entries()) {
    const largo = anchoDeTexto(tecla) + 1 + anchoDeTexto(que) + (i > 0 ? 3 : 0);
    if (col + largo > x + ancho) break;
    if (i > 0) col += b.texto(col, y, " · ", { fg: T.tenue });
    col += b.texto(col, y, tecla, { fg: T.texto, negrita: true });
    col += b.texto(col, y, ` ${que}`, { fg: T.suave });
  }
}

export function reloj(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Un estado vacío: qué es esta sección y qué hacer para llenarla. */
export function vacio(b: Bufer, r: Rect, titulo: string, siguiente: string): void {
  const y = r.y + Math.max(0, Math.floor(r.h / 2) - 1);
  const cx = (s: string) => r.x + Math.max(0, Math.floor((r.w - anchoDeTexto(s)) / 2));
  b.texto(cx(titulo), y, recortar(titulo, r.w), { fg: T.texto, negrita: true });
  b.texto(cx(siguiente), y + 1, recortar(siguiente, r.w), { fg: T.suave });
}
