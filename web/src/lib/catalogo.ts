import type { CapituloDelCatalogo } from "@/components/Catalogo";
import { FUNCIONES } from "./funciones";

/**
 * El inventario, puesto en capítulos de catálogo.
 *
 * Las funciones salen de `funciones.ts`, que se arma leyendo el código del repo; acá solo se
 * ordena los capítulos. Separado a propósito: el inventario cambia cada vez que Dolphin aprende
 * algo nuevo, y el orden de un sumario no.
 */

/** Dónde vive una función, como se lee en el catálogo. */
const COMO_SE_LLAMA: Record<string, string> = {
  terminal: "terminal",
  consola: "consola",
  escritorio: "escritorio",
  bots: "bots",
};

export const CAPITULOS: readonly CapituloDelCatalogo[] = FUNCIONES.map((grupo) => ({
  id: grupo.id,
  titulo: grupo.titulo,
  resumen: grupo.resumen,
  funciones: grupo.funciones.map((f) => ({
    nombre: f.nombre,
    queHace: f.queHace,
    ...(f.comando ? { comando: f.comando } : {}),
    ...(f.donde.length > 0 ? { donde: f.donde.map((d) => COMO_SE_LLAMA[d] ?? d) } : {}),
  })),
}));
