import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { git, gitValor } from "./git.js";

/**
 * Lo que la consola muestra de un repo de git: sus ramas, sus commits y sus issues, con quién
 * trabajó en cada cosa. Pedido de Nico (28/10): «así quiero que se vean las ramas, commits e issues
 * cuando estés con un git», sobre una tabla con filtros, columnas a elegir y avatares.
 *
 * Todo sale de git y de `gh` (si está y el repo es de GitHub), leído en el momento: no se guarda
 * nada aparte que pueda quedar viejo.
 */

export interface Persona {
  readonly nombre: string;
  readonly login?: string;
  /** La foto de GitHub: solo cuando se sabe el usuario (el mail «noreply» de GitHub o lo que dice `gh`). */
  readonly avatar?: string;
}

export interface Rama {
  readonly nombre: string;
  readonly actual: boolean;
  /** Una rama que abrió Dolphin (siembras, equipo, bugs). */
  readonly deDolphin: boolean;
  readonly hash: string;
  readonly mensaje: string;
  readonly fecha: string;
  readonly autores: readonly Persona[];
  /** Commits que tiene y la base no, y al revés. */
  readonly adelante: number;
  readonly atras: number;
  readonly mergeada: boolean;
  readonly pr?: { readonly numero: number; readonly estado: string; readonly url: string };
}

export interface Commit {
  readonly hash: string;
  readonly hashCorto: string;
  readonly mensaje: string;
  readonly fecha: string;
  readonly autor: Persona;
  /** Las ramas y etiquetas que apuntan a este commit. */
  readonly refs: readonly string[];
}

export interface Issue {
  readonly numero: number;
  readonly titulo: string;
  readonly abierto: boolean;
  readonly etiquetas: readonly string[];
  readonly asignados: readonly Persona[];
  readonly autor?: Persona;
  /** Cuándo lo abrieron. */
  readonly fecha: string;
  /** Cuándo se movió por última vez: es lo que ordena una lista de issues, no cuándo nació. */
  readonly actualizado: string;
  readonly url: string;
}

const avatarDe = (login: string) => `https://github.com/${encodeURIComponent(login)}.png?size=64`;

/** El usuario de GitHub de un mail «noreply» (`12345+nico@users.noreply.github.com`); de otro mail no se adivina. */
export function loginDeEmail(email: string): string | undefined {
  return /^(?:\d+\+)?([a-z0-9-]+)@users\.noreply\.github\.com$/i.exec(email.trim())?.[1];
}

export function persona(nombre: string, email = "", login?: string): Persona {
  const usuario = login ?? loginDeEmail(email);
  return { nombre: nombre.trim() || usuario || "?", ...(usuario ? { login: usuario, avatar: avatarDe(usuario) } : {}) };
}

/** Sin repetir a la misma persona (mismo usuario, o mismo nombre si no se sabe el usuario). */
function sinRepetir(personas: readonly Persona[]): Persona[] {
  const vistas = new Set<string>();
  return personas.filter((p) => {
    const clave = (p.login ?? p.nombre).toLowerCase();
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

const SEP = "\x1f";
const ES_DE_DOLPHIN = /^dolphin(?:-[a-z]+)?\//;

/** La rama contra la que se compara: la del remoto si la dice, si no main o master. */
export async function ramaBase(repo: string): Promise<string | undefined> {
  const remota = await gitValor(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], repo).catch(() => "");
  if (remota) return remota.replace(/^origin\//, "");
  for (const candidata of ["main", "master"]) {
    if (await gitValor(["rev-parse", "--verify", "--quiet", `refs/heads/${candidata}`], repo).catch(() => "")) return candidata;
  }
  return undefined;
}

/** Las ramas locales, la más reciente primero, con un tope: un repo con cientos de ramas viejas no traba la consola. */
export async function ramasDelRepo(repo: string, tope = 60, prs: ReadonlyMap<string, Rama["pr"]> = new Map()): Promise<Rama[]> {
  const formato = ["%(refname:short)", "%(objectname)", "%(committerdate:iso-strict)", "%(subject)", "%(HEAD)"].join(SEP);
  const salida = await git(["for-each-ref", "refs/heads", "--sort=-committerdate", `--count=${tope}`, `--format=${formato}`], repo);
  const base = await ramaBase(repo);
  const mergeadas = new Set(
    base
      ? (await git(["branch", "--merged", base, "--format=%(refname:short)"], repo).catch(() => ""))
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
      : [],
  );
  const filas = salida.split(/\r?\n/).filter(Boolean);
  return Promise.all(
    filas.map(async (fila) => {
      const [nombre = "", hash = "", fecha = "", mensaje = "", cabeza = ""] = fila.split(SEP);
      let adelante = 0;
      let atras = 0;
      let autores: Persona[] = [];
      if (base && nombre !== base) {
        const [izq, der] = (await gitValor(["rev-list", "--left-right", "--count", `${base}...${nombre}`], repo).catch(() => "0\t0")).split(/\s+/);
        atras = Number(izq) || 0;
        adelante = Number(der) || 0;
        // Quién trabajó en la rama: los autores de lo que tiene y la base no.
        const quienes = await git(["log", `${base}..${nombre}`, "-n", "50", `--format=%an${SEP}%ae`], repo).catch(() => "");
        autores = sinRepetir(
          quienes
            .split(/\r?\n/)
            .filter(Boolean)
            .map((l) => {
              const [n = "", e = ""] = l.split(SEP);
              return persona(n, e);
            }),
        );
      }
      if (autores.length === 0) {
        const [n = "", e = ""] = (await gitValor(["log", "-1", `--format=%an${SEP}%ae`, nombre], repo).catch(() => "")).split(SEP);
        autores = [persona(n, e)];
      }
      const pr = prs.get(nombre);
      return {
        nombre,
        actual: cabeza.trim() === "*",
        deDolphin: ES_DE_DOLPHIN.test(nombre),
        hash,
        mensaje,
        fecha,
        autores: autores.slice(0, 6),
        adelante,
        atras,
        mergeada: nombre !== base && mergeadas.has(nombre),
        ...(pr ? { pr } : {}),
      };
    }),
  );
}

/**
 * Los últimos commits de una rama (o de la actual), con las ramas que apuntan a cada uno. También
 * acepta un rango (`base..rama`) o varias puntas.
 */
export async function commitsDelRepo(repo: string, rama?: string | readonly string[], cantidad = 150): Promise<Commit[]> {
  const formato = ["%H", "%h", "%aI", "%an", "%ae", "%D", "%s"].join(SEP);
  const args = ["log", "-n", String(cantidad), `--format=${formato}`];
  const puntas = typeof rama === "string" ? [rama] : (rama ?? []);
  if (puntas.length > 0) args.push(...puntas, "--");
  const salida = await git(args, repo);
  return salida
    .split(/\r?\n/)
    .filter(Boolean)
    .map((fila) => {
      const [hash = "", hashCorto = "", fecha = "", nombre = "", email = "", refs = "", ...resto] = fila.split(SEP);
      return {
        hash,
        hashCorto,
        fecha,
        mensaje: resto.join(SEP),
        autor: persona(nombre, email),
        refs: refs
          .split(",")
          .map((r) => r.trim().replace(/^HEAD -> /, ""))
          .filter((r) => r && r !== "HEAD"),
      };
    });
}

/**
 * Los commits de una rama para su detalle: primero los propios (`base..rama`) y después los últimos
 * que ya comparte con la base. Cortar `git log rama` por la cantidad de adelante no servía: el log va
 * por fecha, y si la rama mergeó la base los de la base se mezclan con los suyos.
 */
export async function commitsDeLaRama(repo: string, rama: string, cantidad = 14): Promise<{ commits: Commit[]; propios?: number }> {
  const base = await ramaBase(repo);
  if (!base || base === rama) return { commits: await commitsDelRepo(repo, rama, cantidad) };
  const propios = await commitsDelRepo(repo, `${base}..${rama}`, cantidad);
  const resto = cantidad - propios.length;
  // Lo que tienen las dos es lo que se alcanza desde sus puntos en común.
  const comunes = resto > 0 ? (await git(["merge-base", "--all", base, rama], repo).catch(() => "")).split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  const compartidos = comunes.length > 0 ? await commitsDelRepo(repo, comunes, resto) : [];
  return { commits: [...propios, ...compartidos], propios: propios.length };
}

/** Un renglón del grafo: los carriles dibujados por git y, si el renglón es un commit, el commit. */
export interface RenglonDeGrafo {
  readonly grafo: string;
  readonly commit?: Commit;
}

/**
 * Los commits de la rama actual con el grafo que dibuja git (`--graph`): las bifurcaciones y los
 * merges como en lazygit. Los renglones sin commit son solo carriles (`|\`, `|/`).
 */
export async function grafoDelRepo(repo: string, cantidad = 200): Promise<RenglonDeGrafo[]> {
  // El separador va una vez adelante: así se sabe dónde termina el dibujo del grafo.
  const formato = SEP + ["%H", "%h", "%aI", "%an", "%ae", "%D", "%s"].join(SEP);
  const salida = await git(["log", "--graph", "-n", String(cantidad), `--format=${formato}`], repo);
  return salida
    .split(/\r?\n/)
    .filter(Boolean)
    .map((linea) => {
      const corte = linea.indexOf(SEP);
      if (corte < 0) return { grafo: linea.trimEnd() };
      const [, hash = "", hashCorto = "", fecha = "", nombre = "", email = "", refs = "", ...resto] = linea.slice(corte).split(SEP);
      const commit: Commit = {
        hash,
        hashCorto,
        fecha,
        mensaje: resto.join(SEP),
        autor: persona(nombre, email),
        refs: refs
          .split(",")
          .map((r) => r.trim().replace(/^HEAD -> /, ""))
          .filter((r) => r && r !== "HEAD"),
      };
      return { grafo: linea.slice(0, corte).trimEnd(), commit };
    });
}

export interface CambioDeArchivo {
  readonly archivo: string;
  readonly agregadas: number;
  readonly quitadas: number;
}

/**
 * Cómo se lee un commit: contra su primer padre, así un merge muestra lo que trajo (sin esto `show`
 * no lista nada), y sin renombres, que dejan una sola ruta por archivo para pedir su diff.
 */
const COMO_SE_LEE = ["--no-renames", "--diff-merges=first-parent", "--no-color", "--format="] as const;

/** Lo que cambió un commit: el mensaje entero y cada archivo con sus renglones agregados y quitados. */
export async function detalleDeCommit(repo: string, hash: string): Promise<{ mensaje: string; archivos: CambioDeArchivo[] }> {
  const [mensaje, numstat] = await Promise.all([
    gitValor(["log", "-1", "--format=%B", hash], repo),
    git(["show", "--numstat", ...COMO_SE_LEE, hash], repo),
  ]);
  const archivos = numstat
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [a = "0", q = "0", ...ruta] = l.split("\t");
      // Los binarios vienen con «-»: cuentan como cero renglones.
      return { archivo: ruta.join("\t"), agregadas: Number(a) || 0, quitadas: Number(q) || 0 };
    });
  return { mensaje, archivos };
}

/** El diff de un commit, o de uno de sus archivos. Con tope: un commit que sube un lockfile no traba la vista. */
export async function diffDeCommit(repo: string, hash: string, archivo?: string, tope = 4000): Promise<{ texto: string; recortado: boolean }> {
  const salida = await git(["show", "--patch", ...COMO_SE_LEE, hash, "--", ...(archivo ? [archivo] : [])], repo);
  const renglones = salida.replace(/\r?\n$/, "").split(/\r?\n/);
  const recortado = renglones.length > tope;
  return { texto: (recortado ? renglones.slice(0, tope) : renglones).join("\n"), recortado };
}

/** Cómo se le pregunta a `gh`. Los tests lo inyectan: acá no se habla con GitHub. */
export type PreguntarAGh = (repo: string, args: readonly string[]) => Promise<string>;

const correr = promisify(execFile);
export const preguntarAGh: PreguntarAGh = async (repo, args) =>
  (await correr("gh", [...args], { cwd: repo, windowsHide: true, timeout: 20_000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: "1" } })).stdout;

interface PersonaDeGh {
  readonly login?: string;
  readonly name?: string;
}
const deGh = (p: PersonaDeGh | undefined): Persona | undefined => (p?.login ? persona(p.name || p.login, "", p.login) : undefined);

export type ResultadoDeIssues =
  | {
      readonly disponible: true;
      readonly issues: readonly Issue[];
      /** `owner/nombre`, para decir de qué repo son sin preguntárselo de nuevo a GitHub. */
      readonly repo?: string;
      /** Dónde se abre uno nuevo. Sale de la URL de un issue y no de «github.com» a mano: con
       *  GitHub Enterprise el host es otro, y un botón que lleva al lugar equivocado es peor que no estar. */
      readonly nuevoIssue?: string;
      /** Con quién está logueado `gh`: es lo que hace que «asignados a mí» quiera decir algo. */
      readonly yo?: string;
    }
  | { readonly disponible: false; readonly porQue: string };

/**
 * De la URL de un issue: de qué repo es (`owner/nombre`) y dónde se abre uno nuevo.
 *
 * Sale de la URL y no de «github.com» escrito a mano porque con GitHub Enterprise el host es
 * otro; de cualquier cosa que no sea una dirección, nada.
 */
export function repoDeUrlDeIssue(url: string): { readonly repo: string; readonly nuevo: string } | undefined {
  let partida: URL;
  try {
    partida = new URL(url.trim());
  } catch {
    return undefined;
  }
  if (partida.protocol !== "http:" && partida.protocol !== "https:") return undefined;
  const [duenio, nombre] = partida.pathname.split("/").filter(Boolean);
  if (!duenio || !nombre) return undefined;
  return { repo: `${duenio}/${nombre}`, nuevo: `${partida.origin}/${duenio}/${nombre}/issues/new` };
}

/**
 * Con quién está logueado `gh`. Una sola llamada y perdonadora: sin sesión, sin red o con una
 * respuesta rara, no hay «yo» y la vista esconde «asignados a mí» en vez de mentir.
 */
async function quienSoyEnGitHub(repo: string, gh: PreguntarAGh): Promise<string | undefined> {
  try {
    const login = (await gh(repo, ["api", "user", "--jq", ".login"])).trim();
    return /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login) ? login : undefined;
  } catch {
    return undefined;
  }
}

/** Los issues del repo en GitHub. Sin `gh`, sin sesión o sin remoto de GitHub, se dice por qué en vez de fallar. */
export async function issuesDelRepo(repo: string, gh: PreguntarAGh = preguntarAGh): Promise<ResultadoDeIssues> {
  try {
    // Las dos preguntas van juntas: quién soy no tiene por qué sumarle su demora a la lista.
    const [salida, yo] = await Promise.all([
      gh(repo, ["issue", "list", "--state", "all", "--limit", "100", "--json", "number,title,state,labels,assignees,author,createdAt,updatedAt,url"]),
      quienSoyEnGitHub(repo, gh),
    ]);
    const datos = JSON.parse(salida) as {
      number: number;
      title: string;
      state: string;
      labels?: { name: string }[];
      assignees?: PersonaDeGh[];
      author?: PersonaDeGh;
      createdAt: string;
      updatedAt?: string;
      url: string;
    }[];
    const issues = datos.map((d) => {
      const autor = deGh(d.author);
      return {
        numero: d.number,
        titulo: d.title,
        abierto: d.state === "OPEN",
        etiquetas: (d.labels ?? []).map((l) => l.name),
        asignados: (d.assignees ?? []).map(deGh).filter((p): p is Persona => p !== undefined),
        ...(autor ? { autor } : {}),
        fecha: d.createdAt,
        // Un issue de antes de que gh devolviera updatedAt: su fecha de siempre antes que nada.
        actualizado: d.updatedAt ?? d.createdAt,
        url: d.url,
      };
    });
    const suyo = issues.map((i) => repoDeUrlDeIssue(i.url)).find((r) => r !== undefined);
    return { disponible: true, issues, ...(suyo ? { repo: suyo.repo, nuevoIssue: suyo.nuevo } : {}), ...(yo ? { yo } : {}) };
  } catch (error) {
    const texto = error instanceof Error ? error.message : String(error);
    const porQue = /ENOENT|not recognized|no se reconoce/i.test(texto)
      ? "No está el CLI de GitHub (gh). Instalalo y logueate con «gh auth login» para ver los issues."
      : /auth|login/i.test(texto)
        ? "El CLI de GitHub no tiene sesión: corré «gh auth login»."
        : /no git remotes|not a git repository|none of the git remotes/i.test(texto)
          ? "Este repo no tiene un remoto de GitHub, así que no tiene issues."
          : `GitHub no contestó: ${texto.split(/\r?\n/)[0]}`;
    return { disponible: false, porQue };
  }
}

/** Los PR por rama, para marcarlos en la lista de ramas. Sin `gh`, ninguno. */
export async function prsPorRama(repo: string, gh: PreguntarAGh = preguntarAGh): Promise<Map<string, Rama["pr"]>> {
  try {
    const datos = JSON.parse(await gh(repo, ["pr", "list", "--state", "all", "--limit", "100", "--json", "number,headRefName,state,url"])) as {
      number: number;
      headRefName: string;
      state: string;
      url: string;
    }[];
    return new Map(datos.map((d) => [d.headRefName, { numero: d.number, estado: d.state.toLowerCase(), url: d.url }]));
  } catch {
    return new Map();
  }
}
