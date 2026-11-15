import { agregadosDe, todoMenos } from "./cambios.js";
import { quitarWorktree } from "./entorno.js";
// Recortado: acá todo se compara contra un valor («HEAD», «» del status).
import { gitDice, gitValor as git } from "./git.js";

/**
 * La entrega de una rama: lo que hace que el trabajo de un agente sea algo
 * que se puede mergear, y no una carpeta con cambios sueltos.
 *
 * El agente no commitea (se le prohíbe); el commit lo hace Dolphin, con la
 * identidad de git del dueño del repo y sin co-autores: la rama es suya.
 */

/**
 * El título de una tarea: su primera línea. Un pedido del modo live o uno
 * armado desde la bandeja trae abajo el contexto para el agente —el elemento
 * que tocaste, los asuntos—, y eso no es el título: es lo que se lee abriendo
 * el pedido entero (ver restoDeTarea).
 */
export function tituloDeTarea(tarea: string): string {
  return tarea.split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
}

/** Lo que sigue al título: lo que vio el agente además del pedido. Vacío si la tarea es de una línea. */
export function restoDeTarea(tarea: string): string {
  const lineas = tarea.split("\n");
  const titulo = lineas.findIndex((l) => l.trim() !== "");
  return titulo < 0 ? "" : lineas.slice(titulo + 1).join("\n").trim();
}

/** El commit de una entrega: el título de la tarea, corto. Un pedido armado de la bandeja tiene decenas de líneas. */
export function mensajeDeEntrega(tarea: string): string {
  const primera = tituloDeTarea(tarea) || "trabajo de dolphin";
  const corta = primera.length > 72 ? `${primera.slice(0, 71).trimEnd()}…` : primera;
  return `dolphin: ${corta}`;
}

export interface Entregador {
  /** El commit desde el que arranca todo: lo de cada tarea se compara contra esto. */
  head(): Promise<string>;
  /** Commitea lo que dejó el agente en su worktree y devuelve el commit. Si ya estaba commiteado, devuelve ese. */
  commitear(worktree: string, mensaje: string): Promise<string>;
  /** Los archivos en los que dos commits chocan al mergearse; vacío si se mergean limpio. */
  chocan(a: string, b: string): Promise<string[]>;
}

export function entregadorDeGit(repo: string): Entregador {
  return {
    head: () => git(["rev-parse", "HEAD"], repo),

    async commitear(worktree, mensaje) {
      // Todo menos lo que Dolphin le agregó al worktree: un `.env` copiado o el
      // enlace a node_modules no son de la rama, y con `add -A` a secas el
      // `.env` terminaba en el commit, y de ahí en un PR (ver cambios.ts).
      const agregados = await agregadosDe(worktree);
      await git(["add", "-A", ...todoMenos(agregados)], worktree);
      // Si alguno ya estaba en el índice como nuevo (una foto vuelta atrás lo deja ahí), sale también.
      const colados = (await git(["diff", "--cached", "--name-only", "--diff-filter=A", "-z", "--", ...agregados], worktree).catch(() => ""))
        .split("\0")
        .filter(Boolean);
      if (colados.length > 0) await git(["rm", "-r", "-q", "--cached", "--", ...colados], worktree);
      // La siembra ya pudo haberla entregado: entregar dos veces no es un error.
      const hayAlgo = !(await gitDice(["diff", "--cached", "--quiet"], worktree));
      if (hayAlgo) await git(["commit", "-q", "--no-verify", "-m", mensaje], worktree);
      return git(["rev-parse", "HEAD"], worktree);
    },

    async chocan(a, b) {
      // merge-tree --write-tree simula el merge sin tocar ningún archivo ni
      // el índice: sale 0 si entra limpio y 1 con la lista de conflictos.
      try {
        await git(["merge-tree", "--write-tree", "--name-only", "--no-messages", a, b], repo);
        return [];
      } catch (error) {
        const salida = (error as { stdout?: string; code?: number }).stdout ?? "";
        if ((error as { code?: number }).code !== 1) throw error;
        // La primera línea es el árbol resultante; las demás, los archivos en conflicto.
        return salida.split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
      }
    },
  };
}

// ── El estado de una rama entregada, como en DOLPHIN ───────────────────────────

export interface RamaEntregada {
  readonly rama: string;
  readonly commit: string;
  /** El commit desde el que se sembró. */
  readonly base: string;
  /** La rama del repo en la que se sembró (main, master…): adonde se mergea. */
  readonly ramaBase?: string;
}

export type EstadoDeRama = "probada" | "mergeada" | "descartada";

export async function ramaActual(repo: string): Promise<string | undefined> {
  const nombre = await git(["rev-parse", "--abbrev-ref", "HEAD"], repo).catch(() => "");
  return nombre && nombre !== "HEAD" ? nombre : undefined;
}

async function existe(repo: string, ref: string): Promise<boolean> {
  return gitDice(["rev-parse", "--verify", "--quiet", ref], repo);
}

/** Se pregunta a git, no a un archivo: si la mergeaste a mano en la terminal, también cuenta. */
export async function estadoDeRama(repo: string, entregada: RamaEntregada): Promise<EstadoDeRama> {
  const destino = entregada.ramaBase ?? "HEAD";
  const adentro = await gitDice(["merge-base", "--is-ancestor", entregada.commit, destino], repo);
  if (adentro && entregada.commit !== entregada.base) return "mergeada";
  return (await existe(repo, `refs/heads/${entregada.rama}`)) ? "probada" : "descartada";
}

export type ResultadoDeMerge = { readonly ok: true } | { readonly ok: false; readonly porQue: string };

/**
 * Mergear desde la consola. Sobre el repo de verdad, así que con cuidado:
 * con cambios sin commitear no se toca nada, en otra rama tampoco, y si el
 * merge choca se aborta y se dice dónde. Si sale, se lleva el worktree y la
 * rama (ver limpiarMergeada): con el modo live se junta uno por cada cambio.
 */
export async function mergearRama(repo: string, entregada: RamaEntregada, tarea: string, worktree?: string): Promise<ResultadoDeMerge> {
  if ((await git(["status", "--porcelain"], repo)) !== "") {
    return { ok: false, porQue: "tenés cambios sin commitear en el repo: commitealos o guardalos antes de mergear" };
  }
  const actual = await ramaActual(repo);
  if (entregada.ramaBase && actual !== entregada.ramaBase) {
    return { ok: false, porQue: `estás parado en «${actual ?? "un commit suelto"}»: pasate a «${entregada.ramaBase}» para mergear` };
  }
  try {
    await git(["merge", "--no-ff", "--no-edit", "-m", `Mergea ${mensajeDeEntrega(tarea)}`, entregada.rama], repo);
  } catch {
    const enConflicto = (await git(["diff", "--name-only", "--diff-filter=U"], repo).catch(() => ""))
      .split("\n")
      .filter(Boolean);
    await git(["merge", "--abort"], repo).catch(() => {});
    return {
      ok: false,
      porQue: enConflicto.length > 0 ? `choca con lo que ya hay en ${enConflicto.join(", ")}: no toqué nada` : "git no pudo mergearla: no toqué nada",
    };
  }
  await limpiarMergeada(repo, entregada.rama, worktree);
  return { ok: true };
}

/**
 * Lo que queda de una rama ya mergeada: el código está en la base, el diff
 * sale de los commits (ver diff.ts) y el estado se le pregunta a git por la
 * historia, así que el worktree y la rama sobran. Con algo sin commitear en
 * el worktree no se toca nada: es trabajo de alguien. Y la rama va con -d,
 * que git no borra si no está adentro.
 */
async function limpiarMergeada(repo: string, rama: string, worktree: string | undefined): Promise<void> {
  if (worktree) {
    // Lo que Dolphin le copió (un `.env`) no cuenta como trabajo pendiente de nadie.
    const agregados = await agregadosDe(worktree).catch(() => [] as string[]);
    const pendiente = await git(["status", "--porcelain", ...todoMenos(agregados)], worktree).catch(() => undefined);
    if (pendiente !== undefined && pendiente !== "") return;
    // Suelta el enlace a node_modules antes del remove, y saca solo ESE worktree (ver entorno.ts).
    if (pendiente === "") await quitarWorktree(repo, worktree);
  }
  await git(["branch", "-d", rama], repo).catch(() => {});
}

/** Descartar: se va el worktree y la rama. El commit sigue en el reflog un tiempo, por las dudas. */
export async function descartarRama(repo: string, entregada: RamaEntregada, worktree?: string): Promise<void> {
  if (worktree) await quitarWorktree(repo, worktree);
  await git(["branch", "-D", entregada.rama], repo).catch(() => {});
}
