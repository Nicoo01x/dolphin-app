import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { yaEstaAnotada } from "./parecidas.js";
import { crearTarjeta, leerTablero, type Tarjeta, type TipoDeTarjeta } from "./tarjetas.js";

/**
 * Un documento con una lista de cosas se vuelve tarjetas del tablero, sin gastar un token.
 *
 * Es lo que ya existe en todos los repos: un PENDIENTES.md, las notas de una reunión, una spec con
 * su checklist. Hoy eso se copia a mano al tablero o no se copia nunca.
 *
 * Lo que decide qué entra:
 * - **Los ítems de lista** (`- …`, `* …`, `1. …`), no los párrafos: un párrafo es contexto, un
 *   ítem es algo que alguien quiere que pase.
 * - **Lo ya marcado no entra** (`- [x] …`): está hecho, y traerlo sería inventar trabajo.
 * - **El encabezado de su sección va en el detalle**, porque «el botón de arriba» no se entiende
 *   sin saber que la sección se llamaba «Pantalla de alta».
 * - **Lo anidado no entra**: un sub-ítem suele ser el cómo de su padre, no otra tarea.
 */

/** Más de esto de una vez no es un documento con pendientes, es otra cosa. */
export const TOPE_DE_UN_DOCUMENTO = 50;
const LARGO_DEL_TITULO = 120;

export interface PendienteDelDocumento {
  readonly titulo: string;
  /** El encabezado de la sección donde estaba, si tenía. */
  readonly seccion?: string;
  readonly linea: number;
  /** Lo marca como bug lo que diga el ítem: «arreglar», «se rompe», «no anda». */
  readonly tipo: TipoDeTarjeta;
}

const ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(.+)$/;
const MARCADO = /^\[([ xX])\]\s*(.*)$/;
const ENCABEZADO = /^(#{1,6})\s+(.+)$/;
// Lo que suena a algo roto entra como bug: un bug arranca por la prueba que lo muestra.
const SUENA_A_BUG = /\b(arreglar|arregl[áa]|bug|se rompe|no anda|no funciona|falla|error|rompe)\b/i;

/** Saca el texto del marcado de Markdown, que en un título del tablero es ruido. */
function limpiar(texto: string): string {
  return texto
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

/** Los pendientes que dice un documento, en orden. */
export function pendientesDelTexto(markdown: string): PendienteDelDocumento[] {
  const pendientes: PendienteDelDocumento[] = [];
  let seccion: string | undefined;
  const lineas = markdown.split("\n");
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]!;
    const encabezado = ENCABEZADO.exec(linea);
    if (encabezado) {
      seccion = limpiar(encabezado[2]!);
      continue;
    }
    const item = ITEM.exec(linea);
    if (!item) continue;
    // Anidado: es el cómo de su padre, no otra tarea.
    if (item[1]!.length >= 2) continue;
    let texto = item[2]!;
    const marcado = MARCADO.exec(texto);
    if (marcado) {
      if (marcado[1] !== " ") continue; // ya está hecho
      texto = marcado[2]!;
    }
    const titulo = limpiar(texto);
    if (titulo.length < 3) continue;
    pendientes.push({
      titulo: titulo.length > LARGO_DEL_TITULO ? `${titulo.slice(0, LARGO_DEL_TITULO - 1)}…` : titulo,
      ...(seccion ? { seccion } : {}),
      linea: i + 1,
      tipo: SUENA_A_BUG.test(titulo) ? "bug" : "tarea",
    });
  }
  return pendientes;
}

/**
 * Pasa los pendientes de un documento al tablero. Devuelve las tarjetas que creó.
 *
 * Lo que ya está en el tablero con el mismo título no entra de nuevo: correrlo dos veces sobre el
 * mismo documento no duplica nada, y un documento que creció solo trae lo que le agregaron.
 */
export async function documentoATarjetas(repo: string, archivo: string, tope = TOPE_DE_UN_DOCUMENTO): Promise<Tarjeta[]> {
  const ruta = isAbsolute(archivo) ? archivo : join(repo, archivo);
  const texto = await readFile(ruta, "utf8");
  const pendientes = pendientesDelTexto(texto);
  if (pendientes.length === 0) return [];

  const desdeElRepo = relative(resolve(repo), resolve(ruta)).replace(/\\/g, "/") || archivo;
  // No alcanza con el título igual: «exportar los pedidos a CSV» y «exportar a CSV los pedidos»
  // son la misma tarea escrita de dos maneras (ver parecidas.ts).
  const tablero = await leerTablero(repo).catch(() => [] as Tarjeta[]);
  const nuevas: Tarjeta[] = [];
  for (const p of pendientes) {
    if (nuevas.length >= tope) break;
    if (yaEstaAnotada([...tablero, ...nuevas], p.titulo)) continue;
    nuevas.push(
      await crearTarjeta(repo, {
        titulo: p.titulo,
        detalle: [`${desdeElRepo}:${p.linea}`, ...(p.seccion ? [`Sección: ${p.seccion}`] : [])].join("\n"),
        tipo: p.tipo,
        origen: `documento (${desdeElRepo})`,
      }),
    );
  }
  return nuevas;
}
