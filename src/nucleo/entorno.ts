import { spawn } from "node:child_process";
import { lstatSync, unlinkSync } from "node:fs";
import { copyFile, lstat, mkdir, readdir, readFile, rm, stat, symlink, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { git, gitDice, gitValor } from "./git.js";
import { anotarAgregados } from "./cambios.js";
import { anotarHijo, matarArbol, matarHijosYa, olvidarHijo } from "../agentes/ejecutar.js";

/**
 * El worktree de cada rama, listo para que el portón juzgue el CÓDIGO y no
 * la máquina.
 *
 * `git worktree add` trae lo versionado y nada más: sin `node_modules` el
 * typecheck falla por un paquete que no está, sin el `.env` la app no
 * levanta, y el portón le corta a la rama un código que estaba bien. Acá se
 * deja el worktree como el repo:
 * - los archivos sin versionar que hacen falta (`.env` y compañía, más lo
 *   que el repo liste en `.worktreeinclude` o en `entorno.copiar`);
 * - las dependencias: ENLAZADAS al `node_modules` del repo (por defecto: no
 *   ocupa disco, no baja nada y no ejecuta nada), instaladas con el gestor
 *   del repo, o ninguna;
 * - y un comando propio del repo (`entorno.preparar`), si lo tiene.
 *
 * El enlace tiene una trampa medida: `git worktree remove --force` lo SIGUE
 * y borra el `node_modules` del repo. Por eso todo el que borre un worktree
 * llama antes a `soltarEnlaces`, y la siembra los suelta al terminar.
 *
 * No es sólo el de la raíz: un repo con paquetes anidados que tienen SU
 * `node_modules` (una app en `escritorio/`, con su propio workspace) nacía con
 * el de la raíz y sin el del paquete, y en el universo no corría ni un test de
 * esa parte. Se enlaza cada `node_modules` que cuelga de un `package.json`
 * versionado, en la misma ruta relativa. Y con N enlaces la trampa es N veces
 * peor: uno que quede sin soltar y el remove se lleva el `node_modules` REAL de
 * ese paquete. Por eso `soltarEnlaces` los suelta TODOS: los que este proceso
 * creó y los que encuentra caminando el worktree (para el que lo barre otro proceso).
 */

export interface ConfigDeEntorno {
  /** «enlazar» (por defecto, si el repo tiene node_modules), «instalar» o «nada». */
  readonly dependencias?: "enlazar" | "instalar" | "nada";
  /** Archivos sin versionar que el worktree necesita, además de los .env de siempre. */
  readonly copiar?: readonly string[];
  /**
   * Lo que deja el worktree listo; corre adentro, después de lo anterior, con el entorno del
   * universo (su PORT y su DATABASE_URL): una migración migra SU base, no la de todos. Varios
   * comandos van en orden y se para en el primero que falla.
   */
  readonly preparar?: string | readonly string[];
  /** El puerto de cada worktree vivo: en qué variable va (además de PORT) y desde cuál se cuenta. */
  readonly puerto?: { readonly variable?: string; readonly desde?: number };
}

export interface Preparacion {
  /** Lo que se hizo, en una línea cada cosa: va al parte. */
  readonly pasos: readonly string[];
  /** Los `node_modules` enlazados, relativos al worktree y con «/» (el de la raíz es «node_modules»). */
  readonly enlaces?: readonly string[];
  /** Si algo no salió: el portón igual corre y dirá lo suyo. */
  readonly porQue?: string;
}

/** Los .env de siempre: se copian si existen en el repo y no en el worktree. */
const ENV_DE_SIEMPRE = [".env", ".env.local", ".env.development", ".env.development.local", ".env.test", ".env.test.local"];
const TOPE_DE_COMANDO = 10 * 60_000;

const existe = (ruta: string) => stat(ruta).then(() => true, () => false);

/** Una ruta relativa que no se sale del repo (nada de «../» ni absolutas). */
function relativaSegura(ruta: string): string | null {
  const limpia = normalize(ruta.trim());
  if (limpia === "" || limpia === "." || isAbsolute(limpia) || limpia.split(sep).includes("..")) return null;
  return limpia;
}

/**
 * Un monorepo (workspaces de npm/yarn, o pnpm-workspace.yaml): ahí el
 * `node_modules` de la raíz tiene enlaces a los paquetes DEL REPO, así que
 * con él enlazado la rama se probaba contra el código de la persona —su
 * `packages/compartido` y no el de la rama— y el portón daba verdes y rojos falsos.
 */
export async function esMonorepo(repo: string): Promise<boolean> {
  if (await existe(join(repo, "pnpm-workspace.yaml"))) return true;
  try {
    const paquete = JSON.parse(await readFile(join(repo, "package.json"), "utf8")) as { workspaces?: unknown };
    return Array.isArray(paquete.workspaces) || (typeof paquete.workspaces === "object" && paquete.workspaces !== null);
  } catch {
    return false;
  }
}

/** Si nadie dijo otra cosa: instalar en un monorepo, enlazar si el repo tiene sus dependencias, y si no, nada. */
export async function modoDeDependencias(repo: string): Promise<"enlazar" | "instalar" | "nada"> {
  if (await esMonorepo(repo)) return "instalar";
  return (await existe(join(repo, "node_modules"))) ? "enlazar" : "nada";
}

/** Carpetas por las que no se busca ni se baja: no tienen paquetes del repo (o son de otro y pesan). */
const CARPETAS_SIN_PAQUETES = new Set([".git", "node_modules", "dist", "out", "build", "coverage", ".next", ".turbo", ".cache", ".dolphin", ".venv", "target", "__pycache__"]);
/** Hasta cuántas carpetas de profundidad se busca un paquete anidado. */
const PROFUNDIDAD_DE_PAQUETES = 6;

/**
 * Las carpetas (relativas, con «/», sin la raíz) con un `package.json` VERSIONADO. Se le pregunta a
 * git y no se camina el disco: caminando se cuela lo que no es del repo (un paquete de ejemplo
 * dentro de una carpeta ignorada, un `package.json` suelto de una herramienta) y es lento en un repo grande.
 */
export async function paquetesVersionados(repo: string): Promise<string[]> {
  const salida = await git(["ls-files", "-z", "--", ":(glob)**/package.json"], repo).catch(() => "");
  const carpetas = new Set<string>();
  for (const archivo of salida.split("\0")) {
    if (archivo === "") continue;
    const segmentos = archivo.split("/").slice(0, -1);
    if (segmentos.length === 0 || segmentos.length > PROFUNDIDAD_DE_PAQUETES) continue;
    if (segmentos.some((s) => CARPETAS_SIN_PAQUETES.has(s))) continue;
    carpetas.add(segmentos.join("/"));
  }
  return [...carpetas].sort();
}

const esCarpeta = (ruta: string) => stat(ruta).then((d) => d.isDirectory(), () => false);

/**
 * Los paquetes anidados (no la raíz) cuyo `node_modules` se enlaza, según el modo:
 * - `nada` e `instalar` forzados: ninguno. Lo que la persona fijó se respeta tal cual.
 * - `enlazar` forzado: todos los que tienen `node_modules` en el repo.
 * - sin config: los que tienen `node_modules` en el repo; pero si la RAÍZ es un monorepo, sólo los
 *   que son su propio workspace (el `escritorio/` con su `pnpm-workspace.yaml`). Los miembros del
 *   workspace de la raíz los arma la instalación de la raíz: enlazar el de origen sería probar la
 *   rama contra el código de la persona (el falso verde de esMonorepo).
 */
export async function paquetesAnidadosAEnlazar(repo: string, dependencias?: "enlazar" | "instalar" | "nada"): Promise<string[]> {
  if (dependencias === "nada" || dependencias === "instalar") return [];
  const raizMonorepo = dependencias === undefined && (await esMonorepo(repo));
  const elegidos: string[] = [];
  for (const carpeta of await paquetesVersionados(repo)) {
    if (!(await esCarpeta(join(repo, carpeta, "node_modules")))) continue;
    if (raizMonorepo && !(await esMonorepo(join(repo, carpeta)))) continue;
    elegidos.push(carpeta);
  }
  return elegidos;
}

/**
 * Si algún universo va a tener un `node_modules` del repo enlazado (el de la raíz o uno anidado):
 * ahí instalar desde la rama escribe en el del repo (ver INSTALAR_CON_EL_ENLACE). Es la pregunta
 * que tiene que hacer la siembra para prohibirle instalar al agente: preguntar sólo por la raíz
 * dejaba afuera a `escritorio/`.
 */
export async function enlazaDependencias(repo: string, dependencias?: "enlazar" | "instalar" | "nada"): Promise<boolean> {
  if ((dependencias ?? (await modoDeDependencias(repo))) === "enlazar") return true;
  return (await paquetesAnidadosAEnlazar(repo, dependencias)).length > 0;
}

/**
 * Con el `node_modules` del repo enlazado, instalar desde la rama escribe en
 * el del repo —y en el de todas las demás ramas—. Lo que corre solo no lo
 * puede hacer (ver siembra.ts); una dependencia nueva va en package.json y se
 * ve en la forma.
 */
export const INSTALAR_CON_EL_ENLACE: readonly string[] = [
  "Bash(npm install:*)",
  "Bash(npm i:*)",
  "Bash(npm ci:*)",
  "Bash(npm add:*)",
  "Bash(pnpm install:*)",
  "Bash(pnpm i:*)",
  "Bash(pnpm add:*)",
  "Bash(yarn install:*)",
  "Bash(yarn add:*)",
  "Bash(bun install:*)",
  "Bash(bun add:*)",
  // Lo que sube o saca versiones escribe en el mismo lugar que instalar. Los patrones no miran en
  // qué carpeta corre el comando: valen igual para el node_modules enlazado de un paquete anidado
  // (`cd escritorio && pnpm install`).
  "Bash(npm update:*)",
  "Bash(npm uninstall:*)",
  "Bash(npm remove:*)",
  "Bash(pnpm update:*)",
  "Bash(pnpm up:*)",
  "Bash(pnpm remove:*)",
  "Bash(pnpm rm:*)",
  "Bash(yarn remove:*)",
  "Bash(yarn upgrade:*)",
  "Bash(bun remove:*)",
];

/** `.worktreeinclude`: una ruta por línea, relativa al repo; `#` es comentario. */
export async function leerIncluir(repo: string): Promise<string[]> {
  const texto = await readFile(join(repo, ".worktreeinclude"), "utf8").catch(() => "");
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

/** El comando de instalación del gestor del repo, sin red si se puede. De afuera: sin scripts de instalación. */
export async function comandoDeInstalacion(repo: string, deAfuera = false): Promise<string | null> {
  const sinScripts = deAfuera ? " --ignore-scripts" : "";
  if (await existe(join(repo, "pnpm-lock.yaml"))) return `pnpm install --frozen-lockfile --prefer-offline${sinScripts}`;
  if (await existe(join(repo, "yarn.lock"))) return `yarn install --frozen-lockfile --prefer-offline${sinScripts}`;
  if ((await existe(join(repo, "bun.lock"))) || (await existe(join(repo, "bun.lockb")))) return `bun install --frozen-lockfile${sinScripts}`;
  if (await existe(join(repo, "package-lock.json"))) return `npm ci --prefer-offline --no-audit --no-fund${sinScripts}`;
  if (await existe(join(repo, "package.json"))) return `npm install --prefer-offline --no-audit --no-fund${sinScripts}`;
  return null;
}

/** Corre una línea de comando en el worktree, con tope de tiempo. Devuelve por qué falló, o nada. */
function correrLinea(linea: string, cwd: string, tope = TOPE_DE_COMANDO, entorno: Readonly<Record<string, string>> = {}): Promise<string | undefined> {
  return new Promise((listo) => {
    // Con shell: los gestores de paquetes en Windows son .cmd, y la línea es del repo o nuestra.
    const proceso = spawn(linea, { cwd, shell: true, windowsHide: true, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, ...entorno }, detached: process.platform !== "win32" });
    anotarHijo(proceso.pid);
    proceso.on("close", () => olvidarHijo(proceso.pid));
    let error = "";
    proceso.stderr?.setEncoding("utf8");
    proceso.stderr?.on("data", (trozo: string) => {
      error = (error + trozo).slice(-600);
    });
    const reloj = setTimeout(() => {
      // El árbol entero: `kill()` cerraba el cmd.exe y el `npm ci` seguía instalando solo.
      void matarArbol(proceso.pid).then(() => proceso.kill("SIGKILL"));
      listo(`«${linea}» no terminó en ${Math.round(tope / 60_000)} min`);
    }, tope);
    proceso.on("error", (e) => {
      clearTimeout(reloj);
      listo(`no se pudo correr «${linea}»: ${e.message}`);
    });
    proceso.on("close", (codigo) => {
      clearTimeout(reloj);
      listo(codigo === 0 ? undefined : `«${linea}» salió con ${codigo}${error.trim() ? `: ${error.trim().split("\n").pop()}` : ""}`);
    });
  });
}

/**
 * Deja el worktree como el repo. Nada de esto toca lo versionado: copia lo
 * que falta sin pisar, y el enlace va donde no hay `node_modules`.
 * `deAfuera`: el repo o la tarea no son del dueño, así que no se corre su
 * comando `preparar` ni los scripts de instalación de sus paquetes.
 */
export async function prepararWorktree(
  repo: string,
  worktree: string,
  config: ConfigDeEntorno = {},
  opciones: { readonly deAfuera?: boolean; readonly entorno?: Readonly<Record<string, string>> } = {},
): Promise<Preparacion> {
  const pasos: string[] = [];
  const fallas: string[] = [];

  const aCopiar = [...new Set([...ENV_DE_SIEMPRE, ...(config.copiar ?? []), ...(await leerIncluir(repo))])];
  const copiados: string[] = [];
  for (const cruda of aCopiar) {
    const relativa = relativaSegura(cruda);
    if (!relativa) continue;
    const origen = join(repo, relativa);
    const destino = join(worktree, relativa);
    const datos = await stat(origen).catch(() => null);
    if (!datos?.isFile() || (await existe(destino))) continue;
    await mkdir(dirname(destino), { recursive: true });
    await copyFile(origen, destino);
    copiados.push(relativa.split(sep).join("/"));
    pasos.push(`copió ${relativa.split(sep).join("/")}`);
  }
  // Lo copiado no es trabajo de la rama: sin anotarlo, un `.env` que el repo
  // no ignora terminaba en el commit entregado, y de ahí en un PR (ver cambios.ts).
  await anotarAgregados(worktree, copiados).catch(() => {});

  const modulosDelRepo = join(repo, "node_modules");
  const modo = config.dependencias ?? (await modoDeDependencias(repo));
  const modulos = join(worktree, "node_modules");
  if (modo === "enlazar" && (await existe(modulosDelRepo)) && !(await existe(modulos))) {
    await enlazar(worktree, modulosDelRepo, modulos);
    pasos.push("enlazó node_modules del repo");
  } else if (modo === "instalar") {
    const comando = await comandoDeInstalacion(worktree, opciones.deAfuera);
    if (comando) {
      const falla = await correrLinea(comando, worktree);
      if (falla) fallas.push(falla);
      else pasos.push(`instaló con «${comando}»`);
    }
  }

  // Los paquetes anidados, uno por uno y DESPUÉS de la raíz: si la raíz instaló, lo que dejó armado
  // no se pisa (el enlace sólo va donde no hay nada).
  const nuevos: string[] = [];
  for (const carpeta of await paquetesAnidadosAEnlazar(repo, config.dependencias)) {
    const destino = join(worktree, carpeta, "node_modules");
    // La rama puede no tener ese paquete (lo borró, o es más vieja): no se crea la carpeta de la nada.
    if (!(await existe(join(worktree, carpeta, "package.json")))) continue;
    // lstat y no stat: una carpeta que ya está, o un enlace roto, tampoco se pisan.
    if (await lstat(destino).then(() => true, () => false)) continue;
    await enlazar(worktree, join(repo, carpeta, "node_modules"), destino);
    nuevos.push(`${carpeta}/node_modules`);
    pasos.push(`enlazó ${carpeta}/node_modules del repo`);
  }
  // Como el `.env` copiado, no es trabajo de la rama: ni el diff ni el commit de entrega lo ven
  // (un `.gitignore` con `node_modules/` no cubre un symlink en POSIX; ver cambios.ts).
  await anotarAgregados(worktree, nuevos).catch(() => {});

  // «Instalar» queda para lo que no tiene de dónde enlazar: un paquete anidado que es su propio
  // workspace y nunca se instaló en el repo. Sólo sin config: un modo forzado no se reinterpreta.
  if (config.dependencias === undefined) {
    for (const carpeta of await paquetesVersionados(repo)) {
      const propio = join(worktree, carpeta);
      if ((await esCarpeta(join(repo, carpeta, "node_modules"))) || !(await esMonorepo(propio))) continue;
      const comando = await comandoDeInstalacion(propio, opciones.deAfuera);
      if (!comando) continue;
      const falla = await correrLinea(comando, propio);
      if (falla) fallas.push(falla);
      else pasos.push(`instaló ${carpeta} con «${comando}»`);
    }
  }

  const comandos = (typeof config.preparar === "string" ? [config.preparar] : (config.preparar ?? [])).filter((c) => c.trim() !== "");
  if (comandos.length > 0 && opciones.deAfuera) {
    pasos.push("no corrió «preparar»: el repo o la tarea son de afuera");
  } else {
    for (const comando of comandos) {
      const falla = await correrLinea(comando, worktree, TOPE_DE_COMANDO, opciones.entorno);
      if (falla) {
        fallas.push(falla);
        break;
      }
      pasos.push(`preparó con «${comando}»`);
    }
  }

  const enlaces = [...(enlazados.get(worktree) ?? [])].map((e) => relative(worktree, e).split(sep).join("/"));
  return { pasos, ...(enlaces.length > 0 ? { enlaces } : {}), ...(fallas.length > 0 ? { porQue: fallas.join("; ") } : {}) };
}

/**
 * Pone el enlace y lo registra apenas existe, antes de que nada más pueda fallar: el registro es lo
 * que permite soltarlo (también al cortar el proceso), y un enlace sin soltar es el `node_modules`
 * del repo en manos del `worktree remove`.
 */
async function enlazar(worktree: string, origen: string, destino: string): Promise<void> {
  await mkdir(dirname(destino), { recursive: true });
  // «junction» en Windows: no pide permisos de administrador. En el resto se ignora y es un symlink.
  await symlink(origen, destino, "junction");
  const de = enlazados.get(worktree) ?? new Set<string>();
  de.add(destino);
  enlazados.set(worktree, de);
}

/**
 * Los `node_modules` del worktree que son un enlace (symlink o junction), caminándolo. No sigue ningún
 * enlace, ni baja a un `node_modules` de verdad, ni a las CARPETAS_SIN_PAQUETES: ahí nunca se puso
 * uno. Es la red de `soltarEnlaces` cuando quien suelta no es quien enlazó (el barrido de huérfanos
 * de otro proceso, que no tiene el registro).
 */
export async function enlacesEnElDisco(worktree: string): Promise<string[]> {
  const hallados: string[] = [];
  const visitar = async (carpeta: string, nivel: number): Promise<void> => {
    const entradas = await readdir(carpeta, { withFileTypes: true }).catch(() => []);
    for (const entrada of entradas) {
      const ruta = join(carpeta, entrada.name);
      if (entrada.name === "node_modules") {
        if (entrada.isSymbolicLink()) hallados.push(ruta);
        continue;
      }
      // isDirectory() es falso para un enlace: nunca se entra por uno.
      if (!entrada.isDirectory() || CARPETAS_SIN_PAQUETES.has(entrada.name) || nivel >= PROFUNDIDAD_DE_PAQUETES) continue;
      await visitar(ruta, nivel + 1);
    }
  };
  await visitar(worktree, 0);
  return hallados;
}

/**
 * Suelta TODOS los enlaces del worktree SIN tocar lo enlazado: el de la raíz y los de los paquetes
 * anidados. Va antes de cualquier `git worktree remove`: medido, el remove sigue el enlace y le
 * borra al repo su `node_modules`. Sólo se borran enlaces (lstat): una carpeta de verdad con ese
 * nombre no se toca nunca.
 */
export async function soltarEnlaces(worktree: string): Promise<void> {
  const rutas = new Set([...(enlazados.get(worktree) ?? []), ...(await enlacesEnElDisco(worktree))]);
  for (const ruta of rutas) {
    const datos = await lstat(ruta).catch(() => null);
    if (datos?.isSymbolicLink()) await unlink(ruta).catch(() => {});
  }
  enlazados.delete(worktree);
}

/** Los enlaces que este proceso puso, por worktree (rutas absolutas). */
const enlazados = new Map<string, Set<string>>();

/**
 * Si cortan el proceso (Ctrl+C, cerrar la terminal), suelta los enlaces
 * antes de morir. El worktree puede quedar colgado, pero ya sin el enlace:
 * medido, un `git worktree remove --force` de uno con el enlace puesto le
 * vaciaba al repo su `node_modules`. Lo llaman los comandos que abren
 * worktrees (la siembra, la cola, Guardian), una vez.
 */
export function soltarEnlacesAlCortar(alCortar?: () => void): void {
  const cortar = (codigo: number) => {
    for (const rutas of enlazados.values()) {
      for (const ruta of rutas) {
        try {
          if (lstatSync(ruta).isSymbolicLink()) unlinkSync(ruta);
        } catch {
          // ya no estaba
        }
      }
    }
    enlazados.clear();
    // Y lo que lanzó (agentes, fases): en POSIX van en su propio grupo y un Ctrl+C no les llega.
    matarHijosYa();
    alCortar?.();
    process.exit(codigo);
  };
  // 128 + el número de la señal, como un proceso cortado de verdad.
  process.once("SIGINT", () => cortar(130));
  process.once("SIGTERM", () => cortar(143));
  process.once("SIGHUP", () => cortar(129));
  // Lanzado por la consola, «cancelar» llega por el canal: en Windows no hay
  // señal que se pueda atajar, y matarlo de una dejaba el enlace puesto.
  if (process.channel) {
    process.on("message", (mensaje: unknown) => {
      if ((mensaje as { cortar?: unknown } | null)?.cortar === true) cortar(130);
    });
    // El canal no lo mantiene vivo: termina cuando termina su trabajo.
    process.channel.unref();
  }
}

/**
 * Saca UN worktree de Dolphin: suelta el enlace, lo borra, y si la carpeta
 * ya no estaba, borra solo SU entrada en `.git/worktrees`. Nada de `git
 * worktree prune`: se lleva también los de la persona cuya carpeta no está
 * a mano (un disco desenchufado), con su índice, y al volver el disco ese
 * worktree ya no es un repo.
 */
export async function quitarWorktree(repo: string, ruta: string): Promise<void> {
  await soltarEnlaces(ruta);
  // Es de Dolphin y se lo quiere sacar: la traba de mientras trabajaba ya no hace falta.
  await git(["worktree", "unlock", ruta], repo).catch(() => {});
  const sacado = await gitDice(["worktree", "remove", "--force", ruta], repo);
  // Si la carpeta sigue (trabado, sin permiso), no se toca su entrada: quedaría un worktree sin repo.
  if (sacado || (await existe(ruta))) return;
  const comun = await gitValor(["rev-parse", "--git-common-dir"], repo)
    .then((r) => resolve(repo, r))
    .catch(() => undefined);
  if (!comun) return;
  const mismo = (a: string) => {
    const r = resolve(a).replace(/\\/g, "/").replace(/\/\.git$/, "");
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  const buscado = mismo(ruta);
  const entradas = await readdir(join(comun, "worktrees")).catch(() => [] as string[]);
  for (const entrada of entradas) {
    const gitdir = await readFile(join(comun, "worktrees", entrada, "gitdir"), "utf8").catch(() => "");
    if (gitdir.trim() !== "" && mismo(gitdir.trim()) === buscado) {
      await rm(join(comun, "worktrees", entrada), { recursive: true, force: true }).catch(() => {});
    }
  }
}
