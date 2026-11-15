import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agregadosDe, todoMenos } from "./cambios.js";
import { carpetaDeDolphin, enFila, escribirDeUna, leerEstado } from "./escritura.js";
import { git, gitDice, gitValor } from "./git.js";

/**
 * Volver a cuando andaba, sin saber git.
 *
 * El miedo que frena a cualquiera que programa con agentes es «lo toqué y se rompió todo». Git ya
 * resuelve eso, pero con palabras que no se entienden: reflog, reset duro, stash, HEAD separado.
 * Acá es una lista de momentos en los que el proyecto andaba y un botón para volver a uno.
 *
 * Cada punto se guarda solo cuando algo pasó el portón: esa es la diferencia con un autoguardado.
 * No se guarda lo último, se guarda **lo último que funcionaba**.
 *
 * Tres decisiones que hacen que esto se pueda usar sin miedo:
 *
 * - **No toca tu rama.** El punto es un commit suelto, colgado de una referencia propia
 *   (`refs/dolphin/guardados/…`), igual que un stash. Tu HEAD, tu rama y tu índice quedan como
 *   estaban, así que esto no aparece en tu historial ni en lo que vas a pushear.
 * - **Volver también se puede deshacer.** Antes de volver se guarda un punto con lo que hay,
 *   aunque esté a medias y aunque no compile. Volver nunca puede ser la última palabra.
 * - **Lo que git ignora no se toca**: `node_modules`, los builds, tu `.env`. Volver cambia tu
 *   código, no te vacía la carpeta.
 */

export interface PuntoGuardado {
  readonly id: string;
  readonly cuando: string;
  /** El commit suelto que lo guarda. */
  readonly commit: string;
  /** En qué rama estabas. */
  readonly rama?: string;
  /** Por qué se guardó, en una línea que se lee: «pasó el portón», «antes de volver». */
  readonly porQue: string;
  /** Las fases que estaban en verde, cuando se sabe. */
  readonly fases?: readonly string[];
  /** Había cosas sin commitear cuando se guardó (están adentro del punto igual). */
  readonly conCambiosSinCommitear?: boolean;
}

interface Guardados {
  readonly puntos: readonly PuntoGuardado[];
}

/** Cuántos momentos se guardan. Más que esto no se mira nunca y los commits sueltos se acumulan. */
export const CUANTOS_SE_GUARDAN = 30;

const rutaDeGuardados = (repo: string) => join(repo, ".dolphin", "guardados.json");
const refDe = (id: string) => `refs/dolphin/guardados/${id}`;

async function leerGuardados(repo: string): Promise<Guardados> {
  return leerEstado<Guardados>(rutaDeGuardados(repo), { puntos: [] }, (d) => ({
    puntos: Array.isArray((d as Guardados).puntos)
      ? (d as Guardados).puntos.filter((p): p is PuntoGuardado => typeof p?.id === "string" && typeof p?.commit === "string")
      : [],
  }));
}

/** Los momentos guardados, del más nuevo al más viejo. */
export async function listarGuardados(repo: string): Promise<PuntoGuardado[]> {
  return [...(await leerGuardados(repo)).puntos].reverse();
}

/**
 * Guarda el estado de ahora como un momento al que se puede volver.
 *
 * Se guarda TODO lo que hay en el árbol de trabajo, commiteado o no: el punto es volver a cómo
 * estaba la carpeta, y lo que estabas escribiendo sin commitear es parte de cómo estaba.
 */
export async function guardarEstado(
  repo: string,
  { porQue, fases, ahora = new Date() }: { readonly porQue: string; readonly fases?: readonly string[]; readonly ahora?: Date },
): Promise<PuntoGuardado | undefined> {
  const indice = join(tmpdir(), `dolphin-guardado-${process.pid}-${randomBytes(4).toString("hex")}`);
  const env = { ...process.env, GIT_INDEX_FILE: indice };
  try {
    const cabeza = await gitValor(["rev-parse", "HEAD"], repo).catch(() => "");
    if (!cabeza) return undefined; // un repo sin un solo commit no tiene de dónde colgar nada
    // El índice aparte es lo que hace que esto no toque el tuyo: podés estar a mitad de un `git add`.
    await git(["read-tree", "HEAD"], repo, { env });
    await git(["add", "-A", ...todoMenos(await agregadosDe(repo))], repo, { env });
    const arbol = (await git(["write-tree"], repo, { env })).trim();
    const sucio = !(await gitDice(["diff", "--quiet", "HEAD", arbol], repo));
    const rama = await gitValor(["symbolic-ref", "--short", "-q", "HEAD"], repo).catch(() => "");
    // Un commit suelto: cuelga del HEAD de ahora, pero no está en ninguna rama.
    const commit = (await git(["commit-tree", arbol, "-p", cabeza, "-m", `dolphin: ${porQue}`], repo, { env })).trim();

    const punto: PuntoGuardado = {
      id: `g${ahora.getTime().toString(36)}${randomBytes(3).toString("hex")}`,
      cuando: ahora.toISOString(),
      commit,
      ...(rama ? { rama } : {}),
      porQue,
      ...(fases && fases.length > 0 ? { fases } : {}),
      ...(sucio ? { conCambiosSinCommitear: true } : {}),
    };
    // La referencia es lo que lo salva del `git gc`: sin ella, el commit suelto se borra solo.
    await git(["update-ref", refDe(punto.id), commit], repo);
    await anotar(repo, punto);
    return punto;
  } catch {
    // Guardar un punto no puede romper lo que lo pidió: el portón pasó igual.
    return undefined;
  } finally {
    await rm(indice, { force: true });
  }
}

async function anotar(repo: string, punto: PuntoGuardado): Promise<void> {
  const ruta = rutaDeGuardados(repo);
  await enFila(ruta, async () => {
    const { puntos } = await leerGuardados(repo);
    const todos = [...puntos, punto];
    const sobran = todos.slice(0, Math.max(0, todos.length - CUANTOS_SE_GUARDAN));
    for (const viejo of sobran) await git(["update-ref", "-d", refDe(viejo.id)], repo).catch(() => "");
    await carpetaDeDolphin(repo);
    await escribirDeUna(ruta, `${JSON.stringify({ puntos: todos.slice(-CUANTOS_SE_GUARDAN) }, null, 2)}\n`);
  });
}

/** Por qué no se puede volver ahora. Nada si se puede. */
export async function porQueNoSePuedeVolver(repo: string): Promise<string | undefined> {
  // En medio de un merge o un rebase, volver dejaría el repo en un estado que ni git sabe explicar.
  for (const [archivo, que] of [
    ["MERGE_HEAD", "un merge a medias"],
    ["REBASE_HEAD", "un rebase a medias"],
    ["CHERRY_PICK_HEAD", "un cherry-pick a medias"],
  ] as const) {
    if (await gitDice(["rev-parse", "--verify", "-q", archivo], repo)) {
      return `tenés ${que}: terminalo o cancelalo y después volvé`;
    }
  }
  return undefined;
}

export interface Vuelta {
  readonly volvioA: PuntoGuardado;
  /** El punto que se guardó con lo que había: con esto se deshace la vuelta. */
  readonly loQueHabia?: PuntoGuardado;
}

/**
 * Vuelve el repo a un momento guardado.
 *
 * Antes guarda lo que hay —esté como esté— así que volver nunca pierde nada y siempre se puede
 * deshacer volviendo al punto «antes de volver».
 */
export async function volverA(repo: string, id: string, ahora = new Date()): Promise<Vuelta> {
  const punto = (await leerGuardados(repo)).puntos.find((p) => p.id === id || p.id.startsWith(id));
  if (!punto) throw new Error(`no encuentro el momento «${id}»`);
  const no = await porQueNoSePuedeVolver(repo);
  if (no) throw new Error(no);

  const loQueHabia = await guardarEstado(repo, { porQue: "antes de volver", ahora });
  // `read-tree -u --reset` deja los archivos como estaban SIN mover tu rama: tu HEAD sigue donde
  // estaba, así que lo que volvió aparece como cambios tuyos y los podés mirar antes de commitear.
  await git(["read-tree", "-u", "--reset", punto.commit], repo);
  const respetar = (await agregadosDe(repo)).flatMap((r) => ["-e", `/${r}`]);
  // Lo que se creó después del punto se va; lo ignorado (node_modules, builds, tu .env) no se toca.
  await git(["clean", "-fd", ...respetar], repo);
  return { volvioA: punto, ...(loQueHabia ? { loQueHabia } : {}) };
}

/** Cómo se lee un momento en una lista: «hace 2 h · pasó el portón · test, typecheck». */
export function comoSeLee(punto: PuntoGuardado, ahora = new Date()): string {
  const minutos = Math.max(0, Math.round((ahora.getTime() - Date.parse(punto.cuando)) / 60_000));
  const cuando = minutos < 1 ? "recién" : minutos < 60 ? `hace ${minutos} min` : minutos < 1440 ? `hace ${Math.round(minutos / 60)} h` : `hace ${Math.round(minutos / 1440)} d`;
  const fases = punto.fases && punto.fases.length > 0 ? ` · ${punto.fases.join(", ")}` : "";
  const sucio = punto.conCambiosSinCommitear ? " · con cosas sin commitear" : "";
  return `${cuando} · ${punto.porQue}${fases}${sucio}`;
}
