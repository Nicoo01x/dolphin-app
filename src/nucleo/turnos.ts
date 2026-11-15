import { git, gitValor } from "./git.js";
import { guardarPunto } from "./puntos.js";

/**
 * Los turnos de un agente, con vuelta atrás. Cada turno —escribir, y cada corrección después— deja
 * un commit con lo que había en ese momento, colgado de `refs/dolphin/turnos/<rama>/<n>`: no mueve la
 * rama (lo que mide contra HEAD sigue midiendo lo mismo, ver puntos.ts), sobrevive a un reinicio y git
 * no lo recolecta. Volver a un turno no borra nada: suma un commit «vuelve al turno n» encima de la
 * rama, con el árbol de ese turno; los turnos de después siguen ahí por si querés ir para adelante.
 */

const prefijo = (rama: string) => `refs/dolphin/turnos/${rama}/`;

export interface Turno {
  readonly n: number;
  readonly que: string;
  readonly commit: string;
  readonly agregadas: number;
  readonly quitadas: number;
}

/** Guarda el turno `n` del universo (lo que hay en su carpeta, sin lo ignorado ni lo que agregó Dolphin). */
export async function guardarTurno(ruta: string, rama: string, n: number, que: string): Promise<string> {
  const arbol = await guardarPunto(ruta);
  const padre = await gitValor(["rev-parse", "HEAD"], ruta);
  const commit = (await git(["commit-tree", arbol, "-p", padre, "-m", `turno ${n}: ${que}`], ruta)).trim();
  await git(["update-ref", `${prefijo(rama)}${n}`, commit], ruta);
  return commit;
}

/** Los turnos de una rama, en orden, con lo que cambió cada uno respecto del anterior. */
export async function turnosDe(repo: string, rama: string): Promise<Turno[]> {
  const crudo = await git(["for-each-ref", "--format=%(refname)%09%(objectname)%09%(contents:subject)", prefijo(rama)], repo).catch(() => "");
  const turnos = crudo
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [ref, commit, asunto] = l.split("\t");
      return { n: Number(ref!.slice(prefijo(rama).length)), commit: commit!, que: (asunto ?? "").replace(/^turno \d+: /, "") };
    })
    .filter((t) => Number.isInteger(t.n))
    .sort((a, b) => a.n - b.n);
  const conCambios: Turno[] = [];
  for (const [i, t] of turnos.entries()) {
    const desde = i === 0 ? `${t.commit}^` : turnos[i - 1]!.commit;
    const stat = await git(["diff", "--numstat", desde, t.commit], repo).catch(() => "");
    let agregadas = 0;
    let quitadas = 0;
    for (const l of stat.split("\n").filter(Boolean)) {
      const [mas, menos] = l.split("\t");
      agregadas += Number(mas) || 0;
      quitadas += Number(menos) || 0;
    }
    conCambios.push({ ...t, agregadas, quitadas });
  }
  return conCambios;
}

/** Dónde está sacada la rama, si está en algún worktree. */
async function worktreeDe(repo: string, rama: string): Promise<string | undefined> {
  const lista = await git(["worktree", "list", "--porcelain"], repo).catch(() => "");
  for (const bloque of lista.split(/\r?\n\r?\n/)) {
    if (new RegExp(`^branch refs/heads/${rama.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").test(bloque)) return /^worktree (.+)$/m.exec(bloque)?.[1]?.trim();
  }
  return undefined;
}

/**
 * La rama vuelve al turno `n`: un commit nuevo encima, con el árbol de ese turno. Si la rama está
 * sacada en un worktree de Dolphin, la carpeta queda igual que el turno.
 */
export async function volverAlTurno(repo: string, rama: string, n: number): Promise<{ ok: boolean; porQue: string; commit?: string }> {
  const turno = (await turnosDe(repo, rama)).find((t) => t.n === n);
  if (!turno) return { ok: false, porQue: `la rama ${rama} no tiene un turno ${n}` };
  const punta = await gitValor(["rev-parse", `refs/heads/${rama}`], repo).catch(() => "");
  if (!punta) return { ok: false, porQue: `no existe la rama ${rama}` };
  const arbol = await gitValor(["rev-parse", `${turno.commit}^{tree}`], repo);
  if ((await gitValor(["rev-parse", `${punta}^{tree}`], repo)) === arbol) return { ok: false, porQue: `la rama ya está como en el turno ${n}` };
  const commit = (await git(["commit-tree", arbol, "-p", punta, "-m", `vuelve al turno ${n}: ${turno.que}`], repo)).trim();
  const donde = await worktreeDe(repo, rama);
  if (donde) {
    // La rama está sacada: se mueve desde su worktree, así la carpeta queda como el turno.
    await git(["reset", "--keep", commit], donde);
  } else {
    await git(["update-ref", `refs/heads/${rama}`, commit, punta], repo);
  }
  return { ok: true, porQue: `${rama} volvió al turno ${n} (${turno.que})`, commit };
}

/** Borra los turnos de una rama que se fue: sin esto quedarían colgados para siempre. */
export async function olvidarTurnos(repo: string, rama: string): Promise<void> {
  const refs = (await git(["for-each-ref", "--format=%(refname)", prefijo(rama)], repo).catch(() => "")).split("\n").filter(Boolean);
  for (const ref of refs) await git(["update-ref", "-d", ref], repo).catch(() => "");
}
