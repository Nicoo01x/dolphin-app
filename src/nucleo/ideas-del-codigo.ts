import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDeDolphin, escribirDeUna, leerEstado } from "./escritura.js";
import { git } from "./git.js";
import { yaEstaAnotada } from "./parecidas.js";
import { crearTarjeta, leerTablero, type Tarjeta } from "./tarjetas.js";

/**
 * Los TODO que ya están en el código entran al tablero como ideas, sin gastar un token.
 *
 * Un TODO es una tarea que alguien anotó donde la vio y después nadie volvió a leer: queda en una
 * línea que solo mira quien abre ese archivo. Esto los junta y los pone donde se deciden las cosas.
 *
 * Tres reglas que importan:
 * - **Entra una sola vez.** Se recuerda la huella de cada uno (archivo + texto), así que correrlo
 *   todos los días no llena el tablero de repetidos.
 * - **Que el TODO desaparezca del código no borra la tarjeta.** Puede haberse borrado porque
 *   alguien lo está haciendo, y una tarjeta que se borra sola es trabajo que se pierde.
 * - **Solo lo que git ya sigue.** Nada de node_modules, de carpetas de build ni de lo ignorado.
 */

/** Las marcas que se buscan, como las escribe todo el mundo. */
const MARCAS = ["TODO", "FIXME", "XXX", "HACK"] as const;
/** Cuántas trae como mucho de una pasada: un repo viejo con trescientos TODO no puede inundar el tablero. */
export const TOPE_POR_PASADA = 20;
/** Más largo que esto no es un título: se corta. */
const LARGO_DEL_TITULO = 120;

export interface IdeaDelCodigo {
  readonly archivo: string;
  readonly linea: number;
  readonly marca: string;
  readonly texto: string;
}

interface Vistos {
  readonly huellas: readonly string[];
}

const rutaDeVistos = (repo: string) => join(repo, ".dolphin", "todos-vistos.json");
/** La huella de un TODO: su archivo y su texto. Si se mueve de línea, sigue siendo el mismo. */
export const huellaDe = (idea: Pick<IdeaDelCodigo, "archivo" | "texto">) => `${idea.archivo}\u0000${idea.texto}`;

// En un comentario, y con algo escrito después: «// TODO: sacar esto» sí, «TODOS los clientes» no.
// Hace falta el separador (dos puntos, un guion o un espacio tras un paréntesis) o el fin de la
// palabra, porque si no «TODOS», «FIXMEs» y los nombres de variables entran como tareas.
const BUSCADOR = new RegExp(String.raw`(?:^|[\s/*#<!-])(${MARCAS.join("|")})\b\s*(?:\([^)]*\))?\s*[:\-—]?\s*(.+)$`);

/** Lo que una línea dice, si dice un TODO. */
export function todoDeLaLinea(linea: string): { marca: string; texto: string } | undefined {
  const m = BUSCADOR.exec(linea);
  if (!m) return undefined;
  // Se limpia la cola de un comentario de bloque y los cierres sueltos.
  const texto = m[2]!
    .replace(/\s*(\*\/|-->|"""|'''|\*)\s*$/, "")
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
  // Sin texto no es una tarea, es una marca suelta.
  return texto.length >= 3 ? { marca: m[1]!, texto } : undefined;
}

/** Los TODO de los archivos que git ya sigue. */
export async function buscarIdeasEnElCodigo(repo: string): Promise<IdeaDelCodigo[]> {
  const listado = await git(["ls-files"], repo).catch(() => "");
  const archivos = listado
    .split("\n")
    .map((a) => a.trim())
    .filter((a) => a !== "" && /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|cs|php|sh|css|scss|html|vue|svelte|sql|yml|yaml)$/i.test(a));

  const ideas: IdeaDelCodigo[] = [];
  for (const archivo of archivos) {
    const texto = await readFile(join(repo, archivo), "utf8").catch(() => "");
    if (texto === "" || !MARCAS.some((m) => texto.includes(m))) continue;
    const lineas = texto.split("\n");
    for (let i = 0; i < lineas.length; i++) {
      const encontrado = todoDeLaLinea(lineas[i]!);
      if (encontrado) ideas.push({ archivo, linea: i + 1, marca: encontrado.marca, texto: encontrado.texto });
    }
  }
  return ideas;
}

/**
 * Pasa los TODO nuevos al tablero, como ideas. Devuelve las tarjetas que creó.
 *
 * Las que ya estaban en el tablero no vuelven a entrar, aunque se haya perdido el archivo de
 * vistos: también se mira el tablero de verdad, que es la fuente que no miente.
 */
export async function todosAlTablero(repo: string, tope = TOPE_POR_PASADA): Promise<Tarjeta[]> {
  const ideas = await buscarIdeasEnElCodigo(repo);
  if (ideas.length === 0) return [];

  const vistos = await leerEstado<Vistos>(rutaDeVistos(repo), { huellas: [] }, (d) => ({
    huellas: Array.isArray((d as Vistos).huellas) ? (d as Vistos).huellas.filter((h): h is string => typeof h === "string") : [],
  }));
  const yaEstaban = new Set(vistos.huellas);
  // El tablero manda sobre el archivo de vistos: si alguien lo borró, no se duplica igual.
  for (const t of await leerTablero(repo).catch(() => [] as Tarjeta[])) {
    const dicho = /^(.+):\d+ — (.+)$/.exec(t.detalle?.split("\n")[0] ?? "");
    if (dicho) yaEstaban.add(huellaDe({ archivo: dicho[1]!, texto: dicho[2]! }));
  }

  // Lo que no salió del código: contra eso se compara por parecido, porque el mismo pendiente
  // puede estar anotado a mano con otras palabras. Entre TODO decide la huella y no el parecido:
  // dos TODO parecidos en dos archivos distintos son dos tareas, no una.
  const aMano = (await leerTablero(repo).catch(() => [] as Tarjeta[])).filter((t) => !t.origen.startsWith("código"));

  const nuevas: Tarjeta[] = [];
  const huellasNuevas: string[] = [];
  for (const idea of ideas) {
    const huella = huellaDe(idea);
    if (yaEstaban.has(huella)) continue;
    yaEstaban.add(huella);
    huellasNuevas.push(huella);
    if (nuevas.length >= tope) continue;
    if (yaEstaAnotada(aMano, idea.texto)) continue;
    const titulo = idea.texto.length > LARGO_DEL_TITULO ? `${idea.texto.slice(0, LARGO_DEL_TITULO - 1)}…` : idea.texto;
    nuevas.push(
      await crearTarjeta(repo, {
        titulo,
        // La primera línea dice de dónde salió, con el archivo y la línea: así se va a leer el
        // contexto sin buscar, y así se reconoce el mismo TODO en la próxima pasada.
        detalle: `${idea.archivo}:${idea.linea} — ${idea.texto}`,
        tipo: "idea",
        origen: `código (${idea.marca})`,
      }),
    );
  }

  if (huellasNuevas.length > 0) {
    await carpetaDeDolphin(repo);
    // Se anotan TODAS las que se vieron, hayan entrado o no: las que no entraron por el tope no
    // tienen que volver a proponerse mañana como si fueran nuevas.
    await escribirDeUna(rutaDeVistos(repo), `${JSON.stringify({ huellas: [...yaEstaban] }, null, 2)}\n`);
  }
  return nuevas;
}
