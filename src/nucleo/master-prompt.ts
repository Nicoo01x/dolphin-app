import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { carpetaDeDolphin, claveDeRuta } from "./escritura.js";

/**
 * Master Prompt: sacás o pegás capturas, marcás encima dónde está cada problema —un número por
 * punto— y escribís qué pasa ahí; Dolphin arma el pedido entero para mandárselo a Claude. Las
 * capturas quedan en `.dolphin/prompts/<id>/` y el prompt las nombra por su ruta: Claude Code las
 * abre con Read, sin que tengas que adjuntarlas. Donde hay puntos, también se guarda la captura con
 * los números dibujados encima (`captura-N-marcada.png`): así Claude ve el ① donde vos lo pusiste.
 *
 * Armarlo no gasta nada (`armarPrompt`); mejorarlo le pide a un modelo que lo reescriba, mirando las
 * capturas y el repo, y lo que devuelve se controla: si se olvidó de alguna captura, se le suma.
 */

export interface PinDelPrompt {
  /** Dónde está, en % del ancho y del alto de la captura (0 a 100): vale en cualquier tamaño. */
  readonly x: number;
  readonly y: number;
  /** Qué pasa en ese punto y qué hay que cambiar. */
  readonly nota: string;
}

export interface CapturaDelPrompt {
  /** La ruta absoluta del PNG, como la guardó `guardarCaptura`. */
  readonly ruta: string;
  /** Qué es esta pantalla, o qué hay que mirar en toda la captura. */
  readonly nota: string;
  /** Los puntos marcados encima, en el orden en que se señalaron: el primero es el ①. */
  readonly pines?: readonly PinDelPrompt[];
  /** La misma captura con los números dibujados donde están los puntos, si hay puntos. */
  readonly marcada?: string;
}

export interface BorradorDePrompt {
  /** Lo que querés lograr, con tus palabras. */
  readonly pedido: string;
  readonly capturas: readonly CapturaDelPrompt[];
}

/** Quién reescribe el prompt. Se inyecta en los tests y en la demo: ahí no se gasta. */
export type Mejorador = (prompt: string, repo: string) => Promise<{ texto: string; gastado: number }>;

/** Una captura pesa poco, pero no se acepta cualquier cosa: 12 MB alcanza para un 4K sin comprimir. */
export const TOPE_DE_CAPTURA = 12 * 1024 * 1024;
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ID = /^[\w-]{1,64}$/;
const ORIGINAL = /^captura-(\d+)\.png$/;

export function idDePrompt(ahora = new Date()): string {
  return `${ahora.toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Guarda una captura como `captura-N.png` en la carpeta del prompt y devuelve su ruta. Con `marcaDe`
 * (la ruta de una captura de ese prompt) guarda la versión con los números dibujados al lado de la
 * original, `captura-N-marcada.png`, y la reescribe cada vez que cambian los puntos.
 */
export async function guardarCaptura(repo: string, id: string, png: Buffer, marcaDe?: string): Promise<string> {
  if (!ID.test(id)) throw new Error("el id del prompt tiene que ser letras, números o guiones");
  if (png.length > TOPE_DE_CAPTURA) throw new Error("la captura pesa más de 12 MB");
  if (png.length < FIRMA_PNG.length || !png.subarray(0, FIRMA_PNG.length).equals(FIRMA_PNG)) throw new Error("la captura tiene que ser un PNG");
  const carpeta = join(await carpetaDeDolphin(repo), "prompts", id);
  await mkdir(carpeta, { recursive: true });
  if (marcaDe !== undefined) {
    const nombre = basename(marcaDe);
    if (!ORIGINAL.test(nombre) || claveDeRuta(dirname(marcaDe)) !== claveDeRuta(carpeta)) throw new Error("la captura marcada tiene que ser de una captura de este prompt");
    const ruta = join(carpeta, nombre.replace(/\.png$/, "-marcada.png"));
    await writeFile(ruta, png);
    return ruta;
  }
  const usadas = (await readdir(carpeta)).map((n) => Number(ORIGINAL.exec(n)?.[1] ?? 0));
  const ruta = join(carpeta, `captura-${Math.max(0, ...usadas) + 1}.png`);
  // wx: dos capturas a la vez no se pisan; la segunda falla y se reintenta con el número siguiente.
  try {
    await writeFile(ruta, png, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return guardarCaptura(repo, id, png);
  }
  return ruta;
}

const CIRCULOS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
/** El número de un punto como se escribe en el prompt y se dibuja en la captura: ① para el primero. */
export const numeroDePin = (indice: number): string => CIRCULOS[indice] ?? `(${indice + 1})`;

const sangrado = (texto: string): string => texto.trim().replace(/\n/g, "\n   ");

/** Cada captura con su ruta, la versión marcada si hay puntos, su nota y cada punto con dónde está. */
function lista(capturas: readonly CapturaDelPrompt[]): string[] {
  return capturas.map((c, i) => {
    const pines = c.pines ?? [];
    return [
      `${i + 1}. ${c.ruta}`,
      ...(pines.length > 0 && c.marcada ? [`   Con los puntos dibujados encima: ${c.marcada}`] : []),
      ...(c.nota.trim() ? [`   ${sangrado(c.nota)}`] : []),
      ...pines.map((p, j) => `   ${numeroDePin(j)} a ${Math.round(p.x)} % del borde izquierdo y ${Math.round(p.y)} % del de arriba: ${sangrado(p.nota) || "acá"}`),
    ].join("\n");
  });
}

/** El prompt sin gastar nada: tu pedido, cada captura con su ruta, sus puntos y sus notas, y cómo leerlas. */
export function armarPrompt(b: BorradorDePrompt): string {
  const partes = [b.pedido.trim()];
  if (b.capturas.length > 0) {
    const hayPuntos = b.capturas.some((c) => (c.pines?.length ?? 0) > 0);
    partes.push(
      "",
      b.capturas.length === 1 ? "## La captura" : "## Las capturas",
      "",
      ...lista(b.capturas),
      "",
      "Abrí cada captura con Read antes de cambiar nada: lo que dice cada nota es lo que hay que mirar ahí." +
        (hayPuntos ? " Donde hay puntos, la versión «con los puntos dibujados» los tiene numerados encima de la imagen." : ""),
    );
  }
  return partes.join("\n").trim();
}

/** Lo que se le pide al modelo que mejora el prompt. */
export function pedidoDeMejora(b: BorradorDePrompt): string {
  return [
    "Sos quien le prepara los pedidos a Claude Code. Te paso un pedido escrito rápido, con capturas de pantalla, puntos marcados encima de las capturas y una nota por punto.",
    "Abrí cada captura con Read (la versión «con los puntos dibujados», si la hay) y, si hace falta para entender de qué habla, mirá el repo (Read, Grep, Glob). No cambies nada.",
    "",
    "Devolvé SOLO el prompt reescrito, listo para pegar, en el idioma del pedido y sin saludo ni comentario tuyo. Que tenga:",
    "- qué hay que lograr, en una o dos oraciones;",
    "- qué muestra cada captura y qué hay que cambiar en ella, punto por punto si los tiene (con su número), nombrándola por su número y con sus rutas EXACTAS (las va a abrir otro agente);",
    "- los archivos del repo que tienen que ver, si los encontraste;",
    "- cómo se sabe que está terminado.",
    "No inventes requisitos que no estén en el pedido ni en las capturas. Si algo es ambiguo, decilo como pregunta al final.",
    "",
    "## El pedido",
    "",
    armarPrompt(b),
  ].join("\n");
}

/** Le pide al modelo que lo reescriba; si se olvidó de alguna captura, se la suma al final para que no se pierda. */
export async function mejorarPrompt(b: BorradorDePrompt, repo: string, mejorador: Mejorador): Promise<{ texto: string; gastado: number }> {
  if (!b.pedido.trim() && b.capturas.length === 0) throw new Error("escribí qué querés pedir o sumá una captura");
  const { texto, gastado } = await mejorador(pedidoDeMejora(b), repo);
  const limpio = texto.trim();
  if (!limpio) throw new Error("el modelo no devolvió nada: probá de nuevo o copialo sin mejorar");
  const faltan = b.capturas.filter((c) => !limpio.includes(c.ruta) && !(c.marcada && limpio.includes(c.marcada)));
  if (faltan.length === 0) return { texto: limpio, gastado };
  return { texto: [limpio, "", "## Capturas", "", ...lista(faltan)].join("\n"), gastado };
}

/** El mejorador de la demo: arma el prompt con una estructura fija, sin llamar a nadie. */
export const mejoradorDeDemo: Mejorador = async (prompt) => {
  const pedido = prompt.split("## El pedido\n\n")[1] ?? "";
  return { texto: `## Qué hay que lograr\n\n${pedido.trim()}\n\n## Cómo se sabe que está terminado\n\nLo que muestran las capturas quedó como dicen sus notas.`, gastado: 0 };
};
