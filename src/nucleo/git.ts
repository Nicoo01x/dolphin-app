import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * git, igual para todo Dolphin. Antes había uno por archivo y cada uno
 * tenía una parte de esto:
 *
 * - Rutas tal cual: sin `core.quotePath=false`, «facturación.ts» llega como
 *   `"factura\303\247\303\263n.ts"` y la política no lo reconoce.
 * - Sin preguntar: `GIT_TERMINAL_PROMPT=0`, porque en un turno de la
 *   madrugada nadie escribe la clave de un remoto.
 * - Sin el lock opcional del índice (`GIT_OPTIONAL_LOCKS=0`): la consola lee
 *   el estado y el diff del repo de la persona mientras ella trabaja, y un
 *   `status` que refresca el índice le hacía fallar su propio commit con
 *   «Another git process seems to be running».
 * - Con tope: es todo local y tarda segundos; lo que se cuelga es un
 *   pinentry gráfico esperando la clave de un commit firmado.
 *
 * El idioma no se toca a propósito: ya nada lee texto traducido de git (el
 * culpable del bisect sale de `refs/bisect/bad`, las listas de los formatos
 * porcelana), y el error que se le muestra a la persona sale en el suyo.
 */

const correr = promisify(execFile);

/** Por defecto, en ms. */
export const TOPE_DE_GIT = 120_000;
/** Para un `worktree add`: sacar los archivos de un repo enorme lleva minutos. */
export const TOPE_DEL_CHECKOUT = 10 * 60_000;

export interface OpcionesDeGit {
  /** El entorno entero, si hace falta otro (un `GIT_INDEX_FILE` propio). Por defecto, el de este proceso. */
  readonly env?: NodeJS.ProcessEnv;
  /** En ms. */
  readonly tope?: number;
  readonly senal?: AbortSignal;
}

/** La salida tal cual: sin recortar, porque en `status --porcelain` el espacio del principio es un dato. */
export async function git(args: readonly string[], cwd: string, { env, tope = TOPE_DE_GIT, senal }: OpcionesDeGit = {}): Promise<string> {
  const { stdout } = await correr("git", ["-c", "core.quotePath=false", ...args], {
    cwd,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    timeout: tope,
    env: { ...(env ?? process.env), GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
    ...(senal ? { signal: senal } : {}),
  });
  return stdout;
}

/** Para lo que contesta un valor (`rev-parse`, `symbolic-ref`): sin el salto del final. */
export async function gitValor(args: readonly string[], cwd: string, opciones?: OpcionesDeGit): Promise<string> {
  return (await git(args, cwd, opciones)).trim();
}

/** Las preguntas de sí o no, que git contesta con el código de salida (`merge-base --is-ancestor`, `diff --quiet`). */
export function gitDice(args: readonly string[], cwd: string, opciones?: OpcionesDeGit): Promise<boolean> {
  return git(args, cwd, opciones).then(
    () => true,
    () => false,
  );
}
