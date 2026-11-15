import { randomBytes } from "node:crypto";
import { copyFile, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { git } from "./git.js";

/**
 * Qué cambió una rama: UNA lectura para todos los que la necesitan —la
 * forma, la política, los tests intactos, la configuración que se ejecuta,
 * el caché, el diff de la pantalla y el commit de entrega—. Había cinco
 * copias de «`add -N` + `diff HEAD`», cada una con un agujero distinto:
 *
 * - Con tildes o ñ, git cita la ruta con escapes octales y la política no
 *   veía `migrations/001_añadir.sql`: va `core.quotePath=false` y `-z`.
 * - Con renombres, `{a => b}` no cruzaba entre name-status y numstat, y un
 *   test renombrado al que le sacaron casos no contaba: va `--no-renames`
 *   (un renombre es un borrado más un alta, y el borrado se ve).
 * - Lo que Dolphin le AGREGÓ al worktree —los `.env` copiados, el enlace de
 *   `node_modules`— no es trabajo de la rama: contaba como «tocó un
 *   archivo», cortaba por «tocó .env» y terminaba commiteado en la rama
 *   entregada, y de ahí a un PR. Queda anotado al prepararlo y ningún diff
 *   ni commit lo ve.
 * - `add -N` escribe en el índice: va sobre una COPIA, así que leer nunca
 *   le marca archivos a nadie, ni en un worktree ni en el repo de verdad.
 */

/** Dónde se anota, en la carpeta privada del worktree (no la del repo), lo que Dolphin le agregó. */
const MANIFIESTO = "dolphin-agregados.json";

async function rutaDelManifiesto(worktree: string): Promise<string> {
  return resolve(worktree, (await git(["rev-parse", "--git-path", MANIFIESTO], worktree)).trim());
}

/** Anota lo que Dolphin le agregó al worktree (rutas relativas, con «/»). */
export async function anotarAgregados(worktree: string, rutas: readonly string[]): Promise<void> {
  if (rutas.length === 0) return;
  const manifiesto = await rutaDelManifiesto(worktree);
  const antes = await agregadosAnotados(manifiesto);
  await writeFile(manifiesto, JSON.stringify([...new Set([...antes, ...rutas.map((r) => r.replace(/\\/g, "/"))])]));
}

async function agregadosAnotados(manifiesto: string): Promise<string[]> {
  try {
    const datos = JSON.parse(await readFile(manifiesto, "utf8")) as unknown;
    return Array.isArray(datos) ? datos.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Lo que no es de la rama: lo anotado y, siempre, el `node_modules` de la
 * raíz (en POSIX el enlace es un symlink que git no ignora con
 * `node_modules/`, y terminaba versionado).
 */
export async function agregadosDe(worktree: string): Promise<string[]> {
  const anotados = await rutaDelManifiesto(worktree).then(agregadosAnotados, () => []);
  const todos = [...new Set(["node_modules", ...anotados])];
  // Lo que el repo ya ignora no hace falta excluirlo, y nombrarlo en un pathspec
  // hace que `git add` salga con error («paths are ignored»): se deja afuera.
  // Sale con 1 si no ignora ninguno: lo que ignora viene en la salida igual.
  const ignorados = await git(["check-ignore", "--", ...todos], worktree).catch((error: { stdout?: string }) => error.stdout ?? "");
  const yaIgnorados = new Set(ignorados.split(/\r?\n/).map((l) => l.trim().replace(/\\/g, "/")).filter(Boolean));
  return todos.filter((r) => !yaIgnorados.has(r));
}

/** El pathspec de «todo, menos lo agregado». */
export function todoMenos(agregados: readonly string[]): string[] {
  return ["--", ".", ...agregados.map((r) => `:(exclude,literal)${r}`)];
}

/**
 * Una copia del índice, para que `add -N` no escriba en el de verdad. Sin índice que copiar, se arma uno vacío.
 *
 * La copia conserva la fecha del original. Git confía en la fecha y el tamaño de cada archivo
 * salvo que el archivo sea tan nuevo como el índice («racy git»): ahí relee el contenido. Una
 * copia con la fecha de ahora parecía posterior a todo, y un archivo reescrito en el mismo
 * segundo que el commit y con el mismo tamaño —`a + b` → `a - b`— no figuraba en el diff. En
 * Linux, donde git compara segundos, pasaba seguido: porton-a-mano y tests-intactos fallaban de
 * a ratos en el CI con «la rama no dejó ningún cambio».
 */
async function conIndiceDePaso<T>(worktree: string, trabajo: (env: NodeJS.ProcessEnv) => Promise<T>): Promise<T> {
  const copia = join(tmpdir(), `dolphin-indice-${randomBytes(6).toString("hex")}`);
  try {
    const real = resolve(worktree, (await git(["rev-parse", "--git-path", "index"], worktree)).trim());
    await copyFile(real, copia)
      .then(async () => {
        const original = await stat(real);
        await utimes(copia, original.atime, original.mtime);
      })
      .catch(() => {});
    const env = { ...process.env, GIT_INDEX_FILE: copia };
    return await trabajo(env);
  } finally {
    await rm(copia, { force: true }).catch(() => {});
  }
}

export type EstadoDeCambio = "A" | "M" | "D" | "T";

export interface Cambio {
  readonly ruta: string;
  readonly estado: EstadoDeCambio;
  readonly agregadas: number;
  readonly quitadas: number;
  /** Un binario no tiene líneas: cuenta como archivo. */
  readonly binario: boolean;
}

/**
 * Qué cambió el worktree contra `contra` (por defecto su HEAD), con los
 * archivos nuevos y sin lo que Dolphin le agregó. Tira si la carpeta no es
 * un worktree: «no se pudo leer» no es lo mismo que «no cambió nada».
 */
export async function cambiosDe(worktree: string, contra = "HEAD"): Promise<Cambio[]> {
  const agregados = await agregadosDe(worktree);
  const [numstat, estados] = await conIndiceDePaso(worktree, async (env) => {
    await git(["add", "-N", ...todoMenos(agregados)], worktree, { env }).catch(() => "");
    return Promise.all([
      git(["diff", "--no-renames", "-z", "--numstat", contra, ...todoMenos(agregados)], worktree, { env }),
      git(["diff", "--no-renames", "-z", "--name-status", contra, ...todoMenos(agregados)], worktree, { env }),
    ]);
  });
  return leerCambios(numstat, estados);
}

/** El diff en texto de lo mismo, entero: el que se lee, se revisa o se guarda. */
export async function diffDe(worktree: string, contra = "HEAD", rutas: readonly string[] = []): Promise<string> {
  const agregados = await agregadosDe(worktree);
  return conIndiceDePaso(worktree, async (env) => {
    await git(["add", "-N", ...todoMenos(agregados)], worktree, { env }).catch(() => "");
    const donde = rutas.length > 0 ? ["--", ...rutas] : todoMenos(agregados);
    return git(["diff", "--no-renames", contra, ...donde], worktree, { env });
  });
}

/** Las dos salidas `-z` de git, juntas por ruta. */
export function leerCambios(numstatZ: string, nameStatusZ: string): Cambio[] {
  const lineas = new Map<string, { agregadas: number; quitadas: number; binario: boolean }>();
  // numstat -z: «mas\tmenos\truta\0».
  for (const registro of numstatZ.split("\0")) {
    if (registro === "") continue;
    const [mas, menos, ...resto] = registro.split("\t");
    const ruta = resto.join("\t");
    if (!ruta) continue;
    lineas.set(ruta, {
      agregadas: Number.parseInt(mas ?? "", 10) || 0,
      quitadas: Number.parseInt(menos ?? "", 10) || 0,
      binario: mas === "-" && menos === "-",
    });
  }
  // name-status -z: «M\0ruta\0».
  const cambios: Cambio[] = [];
  const partes = nameStatusZ.split("\0");
  for (let i = 0; i + 1 < partes.length; i += 2) {
    const estado = partes[i]!.trim().charAt(0) as EstadoDeCambio;
    const ruta = partes[i + 1]!;
    if (!ruta || !"AMDT".includes(estado)) continue;
    cambios.push({ ruta, estado, ...(lineas.get(ruta) ?? { agregadas: 0, quitadas: 0, binario: false }) });
  }
  return cambios;
}
