/**
 * Cómo imprimen los comandos de Dolphin (`dolphin git`, `dolphin bots`, `dolphin atajo`…): con los
 * mismos colores que la app de terminal, tablas alineadas y un título por sección. Sin TTY o con
 * NO_COLOR, texto plano: se puede mandar a un archivo o a otro comando sin códigos raros.
 */

const conColor = (): boolean => !process.env.NO_COLOR && (!!process.env.FORCE_COLOR || !!process.stdout.isTTY);

type Rgb = readonly [number, number, number];
/** Los mismos de la terminal (src/tui/piezas.ts): grises para la cáscara, color para lo que pasa. */
export const C = {
  texto: [222, 222, 222],
  suave: [146, 146, 146],
  tenue: [92, 92, 92],
  verde: [92, 200, 120],
  rojo: [240, 110, 110],
  amarillo: [230, 190, 92],
  azul: [104, 170, 240],
  violeta: [178, 148, 255],
  cian: [94, 200, 210],
  rosa: [236, 120, 180],
} as const satisfies Record<string, Rgb>;

export function pintar(texto: string, color: Rgb, { negrita = false } = {}): string {
  if (!conColor()) return texto;
  return `\x1b[${negrita ? "1;" : ""}38;2;${color[0]};${color[1]};${color[2]}m${texto}\x1b[0m`;
}
export const negrita = (texto: string): string => (conColor() ? `\x1b[1m${texto}\x1b[0m` : texto);

/** El largo que se ve, sin los códigos de color y contando cada letra (no cada byte). */
export const largo = (texto: string): number => [...texto.replace(/\x1b\[[0-9;]*m/g, "")].length;

function recortar(texto: string, ancho: number): string {
  if (largo(texto) <= ancho) return texto;
  // Con color no se recorta por la mitad de un código: se recorta el texto plano.
  const plano = [...texto.replace(/\x1b\[[0-9;]*m/g, "")];
  return `${plano.slice(0, Math.max(0, ancho - 1)).join("")}…`;
}

export interface Columna<T> {
  readonly titulo: string;
  readonly valor: (fila: T) => string;
  /** A la derecha: números, fechas relativas. */
  readonly derecha?: boolean;
  /** La que se achica si no entra: la de texto largo (un mensaje, un título). */
  readonly elastica?: boolean;
}

/** Una tabla sin rejas: el título en tenue, las columnas alineadas y la elástica recortada al ancho. */
export function tabla<T>(filas: readonly T[], columnas: readonly Columna<T>[], ancho = process.stdout.columns || 120): string {
  const celdas = filas.map((f) => columnas.map((c) => c.valor(f)));
  const anchos = columnas.map((c, i) => Math.max(largo(c.titulo), ...celdas.map((fila) => largo(fila[i]!))));
  const total = anchos.reduce((s, a) => s + a, 0) + (columnas.length - 1) * 2 + 2;
  const elastica = columnas.findIndex((c) => c.elastica);
  if (total > ancho && elastica >= 0) anchos[elastica] = Math.max(12, anchos[elastica]! - (total - ancho));
  const renglon = (valores: readonly string[], titulo = false) =>
    "  " +
    valores
      .map((v, i) => {
        const texto = recortar(v, anchos[i]!);
        const relleno = " ".repeat(Math.max(0, anchos[i]! - largo(texto)));
        const celda = columnas[i]!.derecha ? relleno + texto : texto + relleno;
        return titulo ? pintar(celda, C.tenue) : celda;
      })
      .join("  ")
      .trimEnd();
  return [renglon(columnas.map((c) => c.titulo), true), ...celdas.map((fila) => renglon(fila))].join("\n");
}

/** Un título de sección: la palabra en negrita y, al lado, un dato tenue (cuántos, de dónde). */
export const titulo = (texto: string, dato = ""): string => `\n  ${negrita(texto)}${dato ? `  ${pintar(dato, C.tenue)}` : ""}\n`;

/** Hace cuánto, corto, para columnas: «ahora», «12 min», «3 h», «2 d», o la fecha. */
export function haceCuanto(iso: string, ahora = Date.now()): string {
  const ms = ahora - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d} d` : new Date(iso).toLocaleDateString("es-AR");
}

/** El color de una persona (siempre el mismo para el mismo nombre), sin verde ni naranja. */
const PALETA: readonly Rgb[] = [C.azul, C.violeta, C.cian, C.rosa, [150, 170, 255], [120, 190, 255], [210, 160, 255], [255, 150, 190]];
export function colorDePersona(clave: string): Rgb {
  let h = 0;
  for (const ch of clave) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length]!;
}
