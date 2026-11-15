import { randomBytes } from "node:crypto";
import { ordenarPorCosto } from "./porton.js";
import { TallerDeGit } from "./taller.js";
import type { Taller, Universo, Verificador } from "./tipos.js";

/**
 * ¿El repo ya estaba en rojo antes de sembrar?
 *
 * Si los tests del repo fallan de entrada, los N universos van a morir en
 * el mismo escalón y la pantalla va a mostrar ocho muertos como si los
 * agentes fueran inútiles. Pasó durante el desarrollo y costó un rato
 * entender que el problema era el repo, no Dolphin.
 *
 * Solo corre lo que no cuesta nada: medir la línea base no puede costar
 * tokens, porque se hace siempre y antes de empezar.
 */

export interface LineaBase {
  readonly sana: boolean;
  /** Qué verificadores ya fallaban. */
  readonly rotos: readonly { nombre: string; detalle: string }[];
  readonly ms: number;
}

/**
 * Se mide en un worktree de la base, como el que va a recibir cada rama, y
 * no en el repo: el árbol de la persona tiene sus cambios a medio hacer (y
 * las ramas salen del commit, no de eso), y medir ahí le corría los scripts
 * encima y le marcaba los archivos nuevos en el índice. `taller` es el de
 * la siembra (con su misma preparación); en los tests, uno de juguete.
 */
export async function medirLineaBase(
  repo: string,
  verificadores: readonly Verificador[],
  taller: Taller = new TallerDeGit(repo),
): Promise<LineaBase> {
  const desde = Date.now();
  const gratis = ordenarPorCosto(verificadores).filter((v) => v.costo === "gratis");
  if (gratis.length === 0) return { sana: true, rotos: [], ms: 0 };

  let base: Universo;
  try {
    base = await taller.abrir("base", `dolphin/linea-base-${randomBytes(3).toString("hex")}`);
  } catch {
    // Sin dónde medir no se frena la siembra: el portón de cada rama dirá lo suyo.
    return { sana: true, rotos: [], ms: Date.now() - desde };
  }

  const resultados: { nombre: string; paso: boolean; detalle: string }[] = [];
  try {
    // De a una, como en el portón: dos fases a la vez en la misma carpeta se pisan (el build y el test).
    for (const verificador of gratis) {
      // Un verificador que explota al medir la línea base no puede tirar el
      // comando entero con un stack trace: esto corre SIEMPRE, antes de
      // abrir una sola rama.
      const veredicto = await verificador.correr(base).catch((error: unknown) => ({
        paso: true,
        detalle: `no se pudo medir (${error instanceof Error ? error.message : String(error)})`,
      }));
      resultados.push({ nombre: verificador.nombre, paso: veredicto.paso, detalle: veredicto.detalle });
    }
  } finally {
    await taller.cerrar(base).catch(() => {});
  }

  const rotos = resultados.filter((r) => !r.paso).map(({ nombre, detalle }) => ({ nombre, detalle }));
  return { sana: rotos.length === 0, rotos, ms: Date.now() - desde };
}

/** Lo que se le dice a la persona cuando el repo ya venía roto. */
export function avisoDeLineaBase(linea: LineaBase): string | undefined {
  if (linea.sana) return undefined;

  const nombres = linea.rotos.map((r) => r.nombre).join(", ");
  return (
    `El repo ya está en rojo antes de sembrar: falla ${nombres}. ` +
    "Todos los universos van a morir ahí y no va a ser culpa de ellos. " +
    "Arreglá eso primero, o sembrá sin ese verificador."
  );
}
