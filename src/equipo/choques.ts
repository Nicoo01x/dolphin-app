import { git } from "../nucleo/git.js";
import { archivosEnComun, normalizarRuta } from "../nucleo/plan.js";

/**
 * Los choques del equipo, avisados mientras trabajan y no recién al integrar: cada tanto se mira qué
 * archivos tiene tocados cada compañero en su worktree (lo commiteado y lo que todavía no) y, si dos
 * que trabajan a la vez —ninguno espera al otro— tocan el mismo archivo, se avisa. Entre el 28 y el
 * 42 % de los pares de ramas de agentes chocan al unirse; enterarse antes es lo que deja corregir el
 * rumbo en vez de tirar trabajo.
 *
 * No frena a nadie: el que decide es el merge (y la cola, que vuelve a sembrar encima si no entran
 * juntas). Esto es la alarma temprana.
 */

export interface Choque {
  /** Los dos compañeros, en orden estable. */
  readonly ids: readonly [string, string];
  readonly archivos: readonly string[];
}

/** Lo que tiene tocado un worktree respecto del punto de partida: cambios, archivos nuevos y borrados. */
export async function archivosTocados(ruta: string, base: string): Promise<Set<string>> {
  const [cambiados, nuevos] = await Promise.all([
    git(["diff", "--name-only", base], ruta).catch(() => ""),
    git(["ls-files", "--others", "--exclude-standard"], ruta).catch(() => ""),
  ]);
  return new Set(`${cambiados}\n${nuevos}`.split("\n").map(normalizarRuta).filter(Boolean));
}

/**
 * Los choques que todavía no se avisaron. `encadenadas(a, b)` dice si una espera a la otra: esas
 * trabajan una encima de la otra y que toquen lo mismo es lo esperado. `vistos` guarda par y archivo
 * ya avisados, para no repetir el aviso en cada vuelta; un archivo nuevo del mismo par sí se avisa.
 */
export function choquesNuevos(
  tocados: ReadonlyMap<string, ReadonlySet<string>>,
  encadenadas: (a: string, b: string) => boolean,
  vistos: Set<string>,
): Choque[] {
  const ids = [...tocados.keys()].sort();
  const choques: Choque[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      if (encadenadas(a, b)) continue;
      const comunes = archivosEnComun([...tocados.get(a)!], [...tocados.get(b)!]).filter((archivo) => !vistos.has(`${a}|${b}|${archivo}`));
      if (comunes.length === 0) continue;
      for (const archivo of comunes) vistos.add(`${a}|${b}|${archivo}`);
      choques.push({ ids: [a, b], archivos: comunes.sort() });
    }
  }
  return choques;
}

export interface Vigilancia {
  /** Una vuelta ya, sin esperar el intervalo (la usan los tests y el cierre). */
  mirar(): Promise<void>;
  parar(): void;
}

/**
 * Mira los worktrees cada `cadaMs` mientras el equipo trabaja. `worktrees()` devuelve los de los
 * compañeros que siguen trabajando (los que terminaron ya no cambian: su choque, si lo hubo, ya se
 * avisó). Una vuelta no se encima con la anterior.
 */
export function vigilarChoques(opciones: {
  base: string;
  worktrees: () => ReadonlyMap<string, string>;
  encadenadas: (a: string, b: string) => boolean;
  alChocar: (choque: Choque) => void;
  cadaMs?: number;
}): Vigilancia {
  const vistos = new Set<string>();
  let corriendo: Promise<void> | null = null;
  const mirar = (): Promise<void> => {
    if (corriendo) return corriendo;
    corriendo = (async () => {
      const activos = [...opciones.worktrees()];
      if (activos.length < 2) return;
      const tocados = new Map(await Promise.all(activos.map(async ([id, ruta]) => [id, await archivosTocados(ruta, opciones.base)] as const)));
      for (const choque of choquesNuevos(tocados, opciones.encadenadas, vistos)) opciones.alChocar(choque);
    })().finally(() => {
      corriendo = null;
    });
    return corriendo;
  };
  const reloj = setInterval(() => void mirar().catch(() => {}), opciones.cadaMs ?? 15_000);
  reloj.unref?.();
  return { mirar, parar: () => clearInterval(reloj) };
}
