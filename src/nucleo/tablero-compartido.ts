import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDeDolphin, escribirDeUna } from "./escritura.js";
import { git, gitDice, gitValor } from "./git.js";
import { carpetaDelTablero, leerTablero, type Tarjeta } from "./tarjetas.js";

/**
 * Compartir el tablero por una rama de git (ver docs/idea.md).
 *
 * El tablero vive en `.dolphin/tablero/`, que está ignorado: es tuyo y no ensucia los commits del
 * proyecto. Para compartirlo con otra máquina o con otra persona se escribe en una rama aparte
 * —`dolphin/tablero` por defecto—, que NO tiene el código: solo las tarjetas.
 *
 * Nada de esto toca tu árbol de trabajo ni tu rama: se arma con las herramientas de bajo nivel de
 * git (`hash-object`, `mktree`, `commit-tree`, `update-ref`), así que podés compartir con cambios a
 * medio hacer sin que se mezcle nada.
 */

export const RAMA_DEL_TABLERO = "dolphin/tablero";

export interface Compartido {
  readonly rama: string;
  readonly commit: string;
  readonly tarjetas: number;
  /** Ya estaba igual: no se escribió un commit nuevo. */
  readonly sinCambios: boolean;
}

/** Los archivos del tablero, por nombre: `<id>.json`. */
async function archivosDelTablero(repo: string): Promise<string[]> {
  const nombres = await readdir(carpetaDelTablero(repo)).catch(() => [] as string[]);
  return nombres.filter((n) => n.endsWith(".json")).sort();
}

/**
 * Escribe el tablero en la rama.
 *
 * El árbol se arma en un índice APARTE (`GIT_INDEX_FILE`), no en el tuyo: así compartir no toca lo
 * que tengas preparado para commitear ni el árbol de trabajo, aunque estés a mitad de algo.
 */
export async function compartirTablero(repo: string, rama = RAMA_DEL_TABLERO, ahora = new Date()): Promise<Compartido> {
  const archivos = await archivosDelTablero(repo);
  const indice = join(await carpetaDeDolphin(repo), `indice-tablero-${process.pid}.tmp`);
  const conIndice = { env: { ...process.env, GIT_INDEX_FILE: indice } };
  let arbol: string;
  try {
    await git(["read-tree", "--empty"], repo, conIndice);
    for (const nombre of archivos) {
      const blob = await gitValor(["hash-object", "-w", "--", join(carpetaDelTablero(repo), nombre)], repo, conIndice);
      await git(["update-index", "--add", "--cacheinfo", `100644,${blob},${nombre}`], repo, conIndice);
    }
    arbol = await gitValor(["write-tree"], repo, conIndice);
  } finally {
    await rm(indice, { force: true }).catch(() => {});
  }
  const anterior = await gitValor(["rev-parse", "--verify", "--quiet", `refs/heads/${rama}`], repo).catch(() => "");
  // Si el árbol es el mismo que el del último commit, no se escribe nada: un commit vacío por cada
  // vez que se comparte llenaría la rama de ruido.
  if (anterior) {
    const arbolAnterior = await gitValor(["rev-parse", `${anterior}^{tree}`], repo).catch(() => "");
    if (arbolAnterior === arbol) return { rama, commit: anterior, tarjetas: archivos.length, sinCambios: true };
  }
  const mensaje = `El tablero: ${archivos.length} ${archivos.length === 1 ? "tarjeta" : "tarjetas"} · ${ahora.toISOString().slice(0, 16).replace("T", " ")}`;
  const commit = await gitValor(["commit-tree", arbol, ...(anterior ? ["-p", anterior] : []), "-m", mensaje], repo);
  await git(["update-ref", `refs/heads/${rama}`, commit, ...(anterior ? [anterior] : [])], repo);
  return { rama, commit, tarjetas: archivos.length, sinCambios: false };
}

export interface Traido {
  readonly rama: string;
  /** Las que no estaban acá. */
  readonly nuevas: readonly string[];
  /** Las que acá estaban más viejas y se pisaron. */
  readonly actualizadas: readonly string[];
  /** Las que acá están más nuevas: se quedan como están. */
  readonly mias: readonly string[];
}

/** Cuándo se tocó una tarjeta por última vez: lo último entre moverla, crearla y comentarla. */
export function ultimoToque(t: Tarjeta): string {
  return [t.movida, t.creada, ...t.comentarios.map((c) => c.cuando)].filter(Boolean).sort().at(-1) ?? t.creada;
}

/** Las tarjetas que hay en la rama, leídas sin sacarlas a disco. */
async function tarjetasDeLaRama(repo: string, rama: string): Promise<Map<string, { tarjeta: Tarjeta; crudo: string }>> {
  const lista = await git(["ls-tree", "--name-only", rama], repo);
  const salida = new Map<string, { tarjeta: Tarjeta; crudo: string }>();
  for (const nombre of lista.split(/\r?\n/).filter((n) => n.endsWith(".json"))) {
    const crudo = await git(["show", `${rama}:${nombre}`], repo).catch(() => "");
    let dato: unknown;
    try {
      dato = JSON.parse(crudo);
    } catch {
      continue;
    }
    const t = dato as Tarjeta | null;
    // Se valida al guardarla, con la misma puerta que el resto del tablero.
    if (t && typeof t.id === "string") salida.set(t.id, { tarjeta: t, crudo });
  }
  return salida;
}

/**
 * Trae lo que haya en la rama. Ante la misma tarjeta de los dos lados gana la que se tocó último:
 * es lo único comparable sin inventar una historia de cambios, y lo que vos tocaste recién no se
 * pierde. Lo que está solo de un lado se conserva: traer nunca borra.
 */
export async function traerTablero(repo: string, rama = RAMA_DEL_TABLERO): Promise<Traido> {
  if (!(await gitDice(["rev-parse", "--verify", "--quiet", `refs/heads/${rama}`], repo))) {
    throw new Error(`no hay una rama «${rama}»: compartilo primero desde la otra máquina`);
  }
  const deLaRama = await tarjetasDeLaRama(repo, rama);
  const mias = new Map((await leerTablero(repo)).map((t) => [t.id, t] as const));
  const nuevas: string[] = [];
  const actualizadas: string[] = [];
  const quedanLasMias: string[] = [];
  await carpetaDeDolphin(repo, "tablero");
  for (const [id, { tarjeta, crudo }] of deLaRama) {
    const mia = mias.get(id);
    if (!mia) {
      nuevas.push(id);
    } else if (ultimoToque(tarjeta) > ultimoToque(mia)) {
      actualizadas.push(id);
    } else {
      quedanLasMias.push(id);
      continue;
    }
    await escribirDeUna(join(carpetaDelTablero(repo), `${id}.json`), crudo.endsWith("\n") ? crudo : `${crudo}\n`);
  }
  return { rama, nuevas, actualizadas, mias: quedanLasMias };
}
