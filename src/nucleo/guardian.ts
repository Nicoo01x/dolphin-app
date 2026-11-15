import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carpetaDeDolphin, enFila, escribirDeUna, leerEstado } from "./escritura.js";
import { cerrarAsuntos, sumarAsuntos } from "./bandeja.js";
import { leerConfig } from "./config.js";
import { prepararWorktree, quitarWorktree } from "./entorno.js";
import { sinFase } from "./porton.js";
import { esClonado, hogarDeDolphin, idDe } from "./proyectos.js";
import { barrerHuerfanos, TRABA } from "./taller.js";
import { fasesDelPaquete, verificadoresDeNpm } from "./verificadores.js";
import { entornoDeDolphin } from "./electron.js";
import { git as gitCrudo, gitDice, gitValor as git, TOPE_DEL_CHECKOUT } from "./git.js";
import type { Universo, Verificador } from "./tipos.js";

/**
 * Guardian: la rama principal, vigilada a cero tokens.
 *
 * Cada commit nuevo pasa por las fases gratis —las que el repo autorizó, y
 * nada más— en un worktree propio, nunca en el árbol de la persona. Lo que
 * estaba en verde en la última base y ahora falla es una regresión: se
 * vuelve a correr para no alarmar por un test inestable, `git bisect run`
 * encuentra el commit que la rompió, y queda una tarjeta en la bandeja con
 * el culpable, la evidencia y cómo reproducirlo. Guardian no arregla nada
 * solo: la tarjeta propone, y sembrar el arreglo es un click de la persona.
 * Cuando la fase vuelve a pasar, la tarjeta se cierra sola.
 *
 * El bisect corre en el worktree de Guardian: las referencias de bisect son
 * por worktree (lo dice git-worktree), así que el repo no se entera.
 *
 * El estado vive en `.dolphin/guardian.json`.
 */

export interface ConfigDeGuardian {
  /** Los scripts de npm que corre: lo autorizado, y nada más. Por defecto, los del repo que sirven de fases. */
  readonly fases?: readonly string[];
  /** Cuántas veces se vuelve a correr una fase que se rompió antes de creerle. */
  readonly repetir?: number;
  /**
   * La rama que vigila. Por defecto, la principal del repo (la de origin, o
   * main/master): mirando HEAD, cada checkout a una rama con un WIP en rojo
   * dejaba una tarjeta falsa, y la base podía quedar en un commit de otra rama.
   */
  readonly rama?: string;
  /** El tope de cada fase y de cada commit del bisect, en segundos. Por defecto, 10 minutos para los dos. */
  readonly tope?: number;
}

export interface FaseRevisada {
  readonly nombre: string;
  readonly paso: boolean;
  readonly detalle: string;
  readonly ms: number;
  /** Falló y al repetirla pasó: no alarma, pero queda a la vista. */
  readonly inestable?: boolean;
  /** No corrió (sin npm en el PATH, por ejemplo): ni verde ni roja. No mueve la base ni cierra tarjetas. */
  readonly salteada?: boolean;
}

export interface Revision {
  readonly sha: string;
  readonly cuando: string;
  readonly fases: readonly FaseRevisada[];
}

export interface Culpable {
  readonly sha: string;
  readonly mensaje: string;
  readonly autor: string;
  readonly archivos: readonly string[];
}

export interface Regresion {
  readonly fase: string;
  /** El último commit con la fase en verde. */
  readonly desde: string;
  /** Dónde se vio rota por primera vez. */
  readonly vista: string;
  readonly culpable?: Culpable;
  readonly detalle: string;
  /** La tarjeta de la bandeja. */
  readonly asunto?: string;
}

/** Dónde estuvo verde por última vez una fase. */
export interface BaseDeFase {
  readonly sha: string;
  readonly cuando: string;
}

export interface EstadoDeGuardian {
  /** La última revisión con todo en verde. */
  readonly base?: Revision;
  /**
   * Por fase, el último commit donde pasó: contra esto se compara cada una.
   * Con una sola base para todas, un lint en rojo hace meses dejaba a Guardian
   * ciego: ningún commit era «todo verde» y ninguna regresión tenía con qué compararse.
   */
  readonly bases?: Readonly<Record<string, BaseDeFase>>;
  /** La última revisión, verde o no. */
  readonly ultima?: Revision;
  /** Lo que se rompió y sigue roto. */
  readonly regresiones: readonly Regresion[];
  readonly inestables: readonly { readonly fase: string; readonly sha: string; readonly cuando: string }[];
}

export interface Informe {
  /** Había un commit nuevo y se revisó. */
  readonly reviso: boolean;
  readonly revision?: Revision;
  readonly nuevas: readonly Regresion[];
  /** Las fases que estaban rotas y volvieron a pasar. */
  readonly arregladas: readonly string[];
  readonly inestables: readonly string[];
  /** Fases en rojo sin una base verde con qué compararlas (el repo ya venía roto). */
  readonly sinBase: readonly string[];
  /** Por qué no revisó, si no revisó. */
  readonly porQue?: string;
}

const ARCHIVO = "guardian.json";


const VACIO: EstadoDeGuardian = { regresiones: [], inestables: [] };

export function leerGuardian(repo: string): Promise<EstadoDeGuardian> {
  return leerEstado(join(repo, ".dolphin", ARCHIVO), VACIO, (crudo) => {
    const datos = (crudo ?? {}) as Partial<EstadoDeGuardian>;
    return { ...VACIO, ...datos, regresiones: datos.regresiones ?? [], inestables: datos.inestables ?? [] };
  });
}

async function guardarGuardian(repo: string, estado: EstadoDeGuardian): Promise<void> {
  const carpeta = await carpetaDeDolphin(repo);
  // De una sola vez (ver escritura.ts): un corte a mitad de camino no deja un JSON roto.
  await escribirDeUna(join(carpeta, ARCHIVO), `${JSON.stringify({ version: 1, ...estado }, null, 2)}\n`);
}

/** Las fases que corre: las autorizadas en `guardian.fases`, o las del repo que sirven de fases sin construir nada. */
export async function fasesDeGuardian(repo: string, config: ConfigDeGuardian = {}): Promise<string[]> {
  if (config.fases) return [...config.fases];
  return fasesDelPaquete(repo, { sinConstruir: true });
}

/** El tope por fase y por commit del bisect si nadie dice otro: el mismo para los dos, o no cierran entre sí. */
const TOPE_POR_DEFECTO = 10 * 60;

/**
 * El que juzga cada commit en el bisect: 0 si la fase pasa, 1 si falla, y
 * 125 —«este no se puede probar»— si en ese commit la fase ni existía o no
 * terminó a tiempo. Al vencer el tope mata el árbol entero: con `spawnSync`
 * y shell solo moría el cmd.exe, y el test colgado seguía con el worktree tomado.
 */
const GUION_DE_BISECT = `import { readFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
// La fase del repo no hereda lo que hizo falta para correr este guion (ver electron.ts).
delete process.env.ELECTRON_RUN_AS_NODE;
const [fase, tope] = process.argv.slice(2);
let scripts = {};
try { scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts ?? {}; } catch { process.exit(125); }
if (!(fase in scripts)) process.exit(125);
const windows = process.platform === "win32";
const hijo = spawn(windows ? "npm.cmd" : "npm", ["run", fase], { stdio: "ignore", shell: windows, detached: !windows });
const reloj = setTimeout(() => {
  try { windows ? execFileSync("taskkill", ["/pid", String(hijo.pid), "/T", "/F"], { stdio: "ignore" }) : process.kill(-hijo.pid, "SIGKILL"); } catch {}
  process.exit(125);
}, Number(tope) * 1000);
hijo.on("exit", (codigo) => { clearTimeout(reloj); process.exit(codigo === 0 ? 0 : codigo === null ? 125 : 1); });
`;

/** El primer commit con la fase rota entre la base (buena) y el actual (malo), por la línea principal. */
async function buscarCulpable(
  ruta: string,
  bueno: string,
  malo: string,
  fase: string,
  carpeta: string,
  tope: number,
): Promise<Culpable | undefined> {
  // Con la historia reescrita la base ya no es antepasada: no hay entre qué buscar.
  const antepasada = await gitDice(["merge-base", "--is-ancestor", bueno, malo], ruta);
  if (!antepasada) return undefined;
  const commits = (await git(["rev-list", "--first-parent", `${bueno}..${malo}`], ruta)).split("\n").filter(Boolean);
  let culpable: string | undefined = commits.length === 1 ? commits[0] : undefined;
  if (commits.length > 1) {
    const guion = join(carpeta, "bisect.mjs");
    await writeFile(guion, GUION_DE_BISECT);
    try {
      await git(["bisect", "start", "--first-parent", malo, bueno], ruta);
      // Lo que tarda en total: el tope de un commit por cada paso del bisect (log2 de los commits), con margen.
      const pasos = Math.ceil(Math.log2(commits.length + 1)) + 1;
      // El guion corre con este mismo ejecutable: adentro de la app, el Electron haciendo de Node.
      await gitCrudo(["bisect", "run", process.execPath, guion, fase, String(tope)], ruta, { tope: (pasos * tope + 60) * 1000, env: entornoDeDolphin() });
      // De la referencia y no del texto «is the first bad commit», que con un git traducido no aparece.
      culpable = (await git(["rev-parse", "--verify", "--quiet", "refs/bisect/bad"], ruta).catch(() => "")) || undefined;
    } catch {
      culpable = undefined;
    } finally {
      await git(["bisect", "reset"], ruta).catch(() => "");
    }
  }
  if (!culpable) return undefined;
  const [mensaje = "", autor = ""] = (await git(["show", "-s", "--format=%s%x00%an", culpable], ruta)).split("\0");
  // Contra su primer padre: en una main con PRs el culpable suele ser un merge,
  // y `git show --name-only` de un merge no lista ningún archivo.
  const tienePadre = await gitDice(["rev-parse", "--verify", "--quiet", `${culpable}^1`], ruta);
  const archivos = (
    tienePadre
      ? await git(["diff", "--name-only", `${culpable}^1`, culpable], ruta)
      : await git(["show", "--name-only", "--format=", culpable], ruta)
  )
    .split("\n")
    .filter(Boolean);
  return { sha: culpable, mensaje, autor, archivos: archivos.slice(0, 20) };
}

/**
 * La rama que vigila: la pedida, o la principal del repo (la de origin, o
 * main/master). Devuelve la referencia completa; HEAD solo si no hay ninguna.
 */
async function ramaDeGuardian(repo: string, pedida: string | undefined): Promise<string> {
  const existe = (ref: string) => gitDice(["rev-parse", "--verify", "--quiet", ref], repo);
  if (pedida) return (await existe(`refs/heads/${pedida}`)) ? `refs/heads/${pedida}` : pedida;
  const deOrigin = (await git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], repo).catch(() => "")).replace(/^origin\//, "");
  for (const rama of [deOrigin, "main", "master"].filter(Boolean)) {
    if (await existe(`refs/heads/${rama}`)) return `refs/heads/${rama}`;
  }
  return "HEAD";
}

/**
 * Las fases que el dueño autorizó para un repo clonado. Viven en el hogar
 * (`~/.dolphin`) y no en el `dolphin.config.json` del repo, que en un clon
 * viene del remoto: un repo publicado con `guardian.fases` se autorizaba solo
 * y Guardian corría sus scripts apenas le apuntabas.
 */
export async function fasesAutorizadas(repo: string, hogar = hogarDeDolphin()): Promise<string[] | undefined> {
  try {
    const datos = JSON.parse(await readFile(join(hogar, AUTORIZADOS), "utf8")) as Record<string, unknown>;
    const fases = datos[idDe(repo)];
    return Array.isArray(fases) ? fases.filter((f): f is string => typeof f === "string") : undefined;
  } catch {
    return undefined;
  }
}

/** Autoriza (o, con una lista vacía, desautoriza) las fases de Guardian para un repo, desde el hogar. */
export async function autorizarFases(repo: string, fases: readonly string[], hogar = hogarDeDolphin()): Promise<void> {
  const ruta = join(hogar, AUTORIZADOS);
  await enFila(ruta, async () => {
    let datos: Record<string, unknown> = {};
    try {
      datos = JSON.parse(await readFile(ruta, "utf8")) as Record<string, unknown>;
    } catch {
      // primera vez
    }
    if (fases.length === 0) delete datos[idDe(repo)];
    else datos[idDe(repo)] = [...fases];
    await mkdir(hogar, { recursive: true });
    await escribirDeUna(ruta, `${JSON.stringify(datos, null, 2)}\n`);
  });
}

const AUTORIZADOS = "guardian-autorizados.json";

/** La traba de Guardian sobre su worktree; detrás va el pid (ver barrerHuerfanos). */
const TRABA_DE_GUARDIAN = `${TRABA}-guardian`;

// Dos revisiones del mismo repo no corren a la vez: la segunda espera a la primera.
const enCurso = new Map<string, Promise<unknown>>();

/**
 * Una pasada: si hay un commit nuevo en la rama, lo revisa. `forzar` lo
 * revisa aunque ya lo haya visto (para la consola o una prueba).
 */
export async function revisarConGuardian(repo: string, opciones: { readonly forzar?: boolean } = {}): Promise<Informe> {
  const anterior = enCurso.get(repo) ?? Promise.resolve();
  const turno = anterior.catch(() => {}).then(() => revisar(repo, opciones));
  enCurso.set(repo, turno);
  return turno;
}


/** Las bases por fase del estado; uno de antes de tenerlas las saca de su base «todo verde». */
function basesDe(estado: EstadoDeGuardian): Record<string, BaseDeFase> {
  if (estado.bases) return { ...estado.bases };
  const bases: Record<string, BaseDeFase> = {};
  for (const f of estado.base?.fases ?? []) if (f.paso && !f.salteada) bases[f.nombre] = { sha: estado.base!.sha, cuando: estado.base!.cuando };
  return bases;
}

async function revisar(repo: string, opciones: { readonly forzar?: boolean }): Promise<Informe> {
  const nada = { reviso: false, nuevas: [], arregladas: [], inestables: [], sinBase: [] } as const;
  const config = await leerConfig(repo);
  const ajustes = config.guardian ?? {};
  // Correr los scripts de un repo clonado es correr código de otro: solo lo
  // que su dueño autorizó desde acá, no lo que diga el config que vino con el código.
  const deAfuera = await esClonado(repo);
  const autorizadas = deAfuera ? await fasesAutorizadas(repo) : undefined;
  if (deAfuera && !autorizadas?.length) {
    return {
      ...nada,
      porQue: `este repo entró clonando una URL: Guardian corre sus scripts solo si los autorizás vos (npm run guardian -- --repo "${repo}" --autorizar test)`,
    };
  }
  const fases = autorizadas ?? (await fasesDeGuardian(repo, ajustes));
  if (fases.length === 0) {
    return { ...nada, porQue: "el repo no tiene scripts que sirvan de fases (sintaxis, typecheck, lint o test): decile cuáles en guardian.fases" };
  }

  const rama = await ramaDeGuardian(repo, ajustes.rama);
  const sha = await git(["rev-parse", rama], repo);
  const estado = await leerGuardian(repo);
  if (!opciones.forzar && estado.ultima?.sha === sha) return nada;
  // Lo que Guardian anota (su estado, las tarjetas) vive en la carpeta que se ignora sola.
  await carpetaDeDolphin(repo);
  // Lo que dejó un Guardian que cortaron (el worktree, trabado con un pid que ya no está), afuera.
  await barrerHuerfanos(repo).catch(() => 0);

  const tope = Math.max(10, ajustes.tope ?? TOPE_POR_DEFECTO);
  const carpeta = await mkdtemp(join(tmpdir(), "dolphin-guardian-"));
  const ruta = join(carpeta, "wt");
  await git(["worktree", "add", "--detach", ruta, sha], repo, { tope: TOPE_DEL_CHECKOUT });
  // Trabado mientras trabaja: un `worktree remove --force` de la persona no se lo lleva
  // con el enlace a node_modules puesto, y si a Guardian lo cortan, el próximo lo barre.
  await git(["worktree", "lock", "--reason", `${TRABA_DE_GUARDIAN} ${process.pid}`, ruta], repo).catch(() => "");
  try {
    await prepararWorktree(repo, ruta, config.entorno, { deAfuera });
    const universo: Universo = { id: "guardian", rama: sha, ruta, nacido: Date.now() };
    const verificadores = verificadoresDeNpm(fases, { tope: tope * 1000 });
    const correrFase = async (v: Verificador) => {
      const desde = Date.now();
      const r = await v.correr(universo).catch((error: unknown) => ({
        paso: false,
        detalle: `${v.nombre}: no se pudo correr (${error instanceof Error ? error.message : String(error)})`,
        evidencia: undefined,
        salteada: false,
      }));
      return {
        nombre: v.nombre,
        paso: r.paso,
        detalle: r.detalle,
        ...(r.evidencia ? { evidencia: r.evidencia } : {}),
        ...(r.salteada ? { salteada: true } : {}),
        ms: Date.now() - desde,
      };
    };

    // Todas las fases, sin cortar en la primera: un informe tiene que decir todo lo que está en rojo.
    const resultados: (FaseRevisada & { evidencia?: string })[] = [];
    for (const v of verificadores) resultados.push(await correrFase(v));

    const bases = basesDe(estado);
    const yaRota = (fase: string) => estado.regresiones.some((g) => g.fase === fase);
    // Una salteada no dice nada: ni verde ni roja.
    const roja = (r: FaseRevisada) => !r.paso && !r.salteada;
    const verde = (r: FaseRevisada) => r.paso && !r.salteada;

    // Lo que se rompió recién se repite antes de creerle: un test inestable no es una regresión.
    const repetir = ajustes.repetir ?? 2;
    const inestables: string[] = [];
    const confirmadas: typeof resultados = [];
    for (const [i, r] of resultados.entries()) {
      if (!roja(r) || !bases[r.nombre] || yaRota(r.nombre)) continue;
      let paso = false;
      for (let vuelta = 0; vuelta < repetir && !paso; vuelta += 1) paso = verde(await correrFase(verificadores[i]!));
      if (paso) {
        inestables.push(r.nombre);
        resultados[i] = { ...r, paso: true, inestable: true, detalle: `${r.nombre}: falló y al repetirla pasó (inestable)` };
      } else {
        confirmadas.push(r);
      }
    }

    const cuando = new Date().toISOString();
    const nuevas: Regresion[] = [];
    for (const r of confirmadas) {
      const base = bases[r.nombre]!;
      const culpable = await buscarCulpable(ruta, base.sha, sha, r.nombre, carpeta, tope);
      const corto = (s: string) => s.slice(0, 7);
      const donde = culpable ? corto(culpable.sha) : `entre ${corto(base.sha)} y ${corto(sha)}`;
      const motivo = sinFase(r.detalle, r.nombre);
      const { sumados } = await sumarAsuntos(repo, [
        {
          tipo: "error",
          titulo: culpable ? `«${r.nombre}» se rompió en ${donde}: ${culpable.mensaje}` : `«${r.nombre}» se rompió ${donde}`,
          detalle: `La fase «${r.nombre}» pasaba en ${corto(base.sha)} y falla desde ${culpable ? corto(culpable.sha) : corto(sha)}: ${motivo}`,
          donde: `fase ${r.nombre}`,
          ...(r.evidencia ? { evidencia: r.evidencia.slice(-3000) } : {}),
          pasos: [`git checkout ${culpable?.sha ?? sha}`, `npm run ${r.nombre}`],
          propuesta: culpable
            ? `El commit ${corto(culpable.sha)}${culpable.autor ? ` (${culpable.autor})` : ""} tocó ${culpable.archivos.join(", ") || "archivos"}: el arreglo empieza ahí. Arreglá la causa, no cambies la prueba para que pase.`
            : "Arreglá la causa, no cambies la prueba para que pase.",
          origen: "guardian",
        },
      ]);
      nuevas.push({
        fase: r.nombre,
        desde: base.sha,
        vista: sha,
        ...(culpable ? { culpable } : {}),
        detalle: motivo,
        ...(sumados[0] ? { asunto: sumados[0].id } : {}),
      });
    }

    // Lo que estaba roto y ahora pasa DE VERDAD (no salteada): la tarjeta se cierra sola, con la constancia.
    const arregladas = estado.regresiones
      .filter((g) => {
        const r = resultados.find((x) => x.nombre === g.fase);
        return r !== undefined && verde(r);
      })
      .map((g) => g.fase);
    for (const fase of arregladas) {
      await cerrarAsuntos(
        repo,
        (a) => a.origen === "guardian" && a.donde === `fase ${fase}`,
        `Guardian volvió a correr «${fase}» en ${sha.slice(0, 7)} y pasa`,
      );
    }

    // Cada fase que pasó mueve SU base: una roja no frena a las demás.
    for (const r of resultados) if (verde(r)) bases[r.nombre] = { sha, cuando };

    const revision: Revision = { sha, cuando, fases: resultados.map(({ evidencia: _evidencia, ...f }) => f) };
    const todoVerde = resultados.every(verde);
    const sinBase = resultados.filter((r) => roja(r) && !bases[r.nombre]).map((r) => r.nombre);
    await guardarGuardian(repo, {
      ...(todoVerde ? { base: revision } : estado.base ? { base: estado.base } : {}),
      bases,
      ultima: revision,
      regresiones: [...estado.regresiones.filter((g) => !arregladas.includes(g.fase)), ...nuevas],
      inestables: [...estado.inestables, ...inestables.map((fase) => ({ fase, sha, cuando }))].slice(-50),
    });
    return { reviso: true, revision, nuevas, arregladas, inestables, sinBase };
  } finally {
    // Suelta el enlace, lo destraba y saca SOLO este worktree: sin `prune`, que se llevaba los de la persona.
    await quitarWorktree(repo, ruta);
    await rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}
