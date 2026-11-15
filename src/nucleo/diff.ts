import { access } from "node:fs/promises";
import { diffDe } from "./cambios.js";
import { git } from "./git.js";

/**
 * El diff de un universo, para mirarlo en la pantalla.
 *
 * Se lee EN VIVO del worktree, no se guarda en la cosecha: un diff grande
 * multiplicado por diez universos convertiría cada `.dolphin/cosechas/*.json`
 * en un archivo de megabytes, y el 99 % de esos diffs no los mira nadie.
 *
 * El precio es que los worktrees de los perdedores ya no están (la siembra
 * los limpia salvo con `--sucio`). Eso no se esconde: la pantalla lo dice y
 * explica cómo conservarlos la próxima vez. La elegida, en cambio, se puede
 * leer de sus commits aunque su worktree ya no esté: mergearla lo limpia.
 */

/** La rama entregada de una cosecha, con lo necesario para leer su diff sin el worktree. */
export interface CommitsDeLaRama {
  readonly repo: string;
  /** El commit desde el que se sembró. */
  readonly base: string;
  /** El commit «dolphin: …» con el trabajo. */
  readonly commit: string;
}

/** Más que esto no entra en una pantalla ni sirve para decidir. */
const TOPE_LINEAS = 1200;

export interface Diff {
  readonly hay: boolean;
  /** Por qué no hay, en voz humana. Vacío cuando sí hay. */
  readonly porQue?: string;
  /**
   * No se pudo leer (no es «no cambió nada»): quien lo juzga —la memoria,
   * la revisión— no puede darlo por bueno, y la fase queda salteada.
   */
  readonly noSePudo?: boolean;
  readonly texto: string;
  readonly recortado: boolean;
  readonly lineas: number;
}

/** De dónde se lee: contra qué commit, la rama entregada y si va entero. */
export interface DeDondeSeLee {
  /** El commit desde el que nació la rama (`Universo.base`). Sin esto —cosechas viejas— se deduce del HEAD. */
  readonly base?: string;
  /** La rama entregada: con ella se lee de sus commits si el worktree ya no está. */
  readonly commits?: CommitsDeLaRama;
  /** Entero, sin el tope de la pantalla: para quien lo juzga. Con el tope, un `console.log` detrás de un lockfile de 1500 líneas no se veía. */
  readonly entero?: boolean;
}

export async function leerDiff(ruta: string, desde: DeDondeSeLee = {}): Promise<Diff> {
  const { commits, entero = false } = desde;
  if (!(await existe(ruta))) {
    // La elegida ya mergeada no tiene worktree, pero lo que entró a la base sigue en la historia.
    const texto = commits ? await git(["diff", "--no-renames", commits.base, commits.commit], commits.repo).catch(() => "") : "";
    if (texto.trim() !== "") return aDiff(texto, entero);
    return {
      hay: false,
      porQue:
        "El worktree de esta rama ya se limpió: solo queda la elegida. Para guardarlas todas, prendé «Guardar el código de todas las ramas» en Nueva o sembrá con --sucio.",
      texto: "",
      recortado: false,
      lineas: 0,
    };
  }

  try {
    // Contra la base de la rama: entregada o no, es lo que hizo el agente
    // (ver cambios.ts: los nuevos cuentan, lo copiado no, el índice no se toca).
    const contra = desde.base ?? commits?.base ?? (await baseDeducida(ruta));
    const texto = await diffDe(ruta, contra);
    if (texto.trim() === "") {
      return { hay: false, porQue: "Este universo no dejó ningún cambio.", texto: "", recortado: false, lineas: 0 };
    }
    return aDiff(texto, entero);
  } catch (error) {
    const crudo = error instanceof Error ? error.message : String(error);
    // El mensaje de execFile arrastra el usage entero de git: a una persona
    // le sirve una línea, no ochenta.
    const porQue = /not a git repository|no es un repositorio git/i.test(crudo)
      ? "Esa carpeta ya no es un worktree de git, así que no hay diff para leer."
      : `No pude leer el diff: ${lineaDelError(crudo)}`;
    return { hay: false, noSePudo: true, porQue, texto: "", recortado: false, lineas: 0 };
  }
}

/**
 * Cosechas de antes de guardar la base: una rama ENTREGADA tiene el
 * trabajo en su commit «dolphin: …» y se lee contra su padre. Se equivoca
 * con una sin entregar sembrada encima de otra entregada: por eso ahora la
 * base viaja con el universo.
 */
async function baseDeducida(ruta: string): Promise<string> {
  const asunto = await git(["log", "-1", "--format=%s"], ruta).catch(() => "");
  return asunto.startsWith("dolphin: ") ? "HEAD~1" : "HEAD";
}

function aDiff(texto: string, entero = false): Diff {
  const lineas = texto.split("\n");
  const recortado = !entero && lineas.length > TOPE_LINEAS;
  return {
    hay: true,
    texto: recortado ? lineas.slice(0, TOPE_LINEAS).join("\n") : texto,
    recortado,
    lineas: lineas.length,
  };
}

/** La línea que explica un error de git: `fatal:`/`error:` si está, si no la primera. */
function lineaDelError(crudo: string): string {
  const lineas = crudo
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  return lineas.find((l) => /^(fatal|error):/i.test(l)) ?? lineas[1] ?? lineas[0] ?? crudo;
}

async function existe(ruta: string): Promise<boolean> {
  try {
    await access(ruta);
    return true;
  } catch {
    return false;
  }
}

