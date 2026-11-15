import { git } from "./git.js";
import { stat } from "node:fs/promises";


/**
 * ¿Se puede sembrar acá?
 *
 * Tres cosas tienen que ser ciertas antes de abrir un solo worktree, y
 * cada una falla distinto si no se revisa: una carpeta que no existe tira
 * un stack trace de Node por la cara, una que no es repo deja un error de
 * git sin contexto, y un repo sin commits hace fallar `worktree add HEAD`
 * con un mensaje que no se entiende.
 */

export interface Revision {
  readonly sirve: boolean;
  /** En voz humana, qué le falta y qué hacer. */
  readonly porQue?: string;
}

export async function revisarRepo(ruta: string): Promise<Revision> {
  try {
    const info = await stat(ruta);
    if (!info.isDirectory()) return { sirve: false, porQue: `«${ruta}» no es una carpeta.` };
  } catch {
    return { sirve: false, porQue: `La carpeta «${ruta}» no existe.` };
  }

  try {
    await git(["rev-parse", "--git-dir"], ruta);
  } catch {
    return {
      sirve: false,
      porQue: `«${ruta}» no es un repositorio git. Dolphin trabaja con worktrees: sin git no hay ramas.`,
    };
  }

  try {
    await git(["rev-parse", "HEAD"], ruta);
  } catch {
    return {
      sirve: false,
      porQue: "El repo no tiene ningún commit todavía. Hacé el primero y volvé: los universos salen de HEAD.",
    };
  }

  return { sirve: true };
}
