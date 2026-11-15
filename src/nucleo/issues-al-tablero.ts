import { yaEstaAnotada } from "./parecidas.js";
import { crearTarjeta, leerTablero, type Tarjeta } from "./tarjetas.js";
import { preguntarAGh, type PreguntarAGh } from "./vista-git.js";

/**
 * Los issues de GitHub, en el tablero.
 *
 * Un issue es una tarea que alguien ya escribió y que hoy vive en otra pantalla. Esto los trae al
 * único lugar donde se decide qué se hace, sin gastar un token.
 *
 * No reemplaza a `issues-noche.ts`, que es otra cosa: esa pasada toma los issues etiquetados y los
 * manda a trabajar de noche. Acá no se trabaja nada; entran como tarjetas y las movés vos.
 *
 * Dos reglas:
 * - **Entran una sola vez**, por su número: el issue #42 es una tarjeta, aunque le cambien el
 *   título. Por eso la huella es el número y no el texto.
 * - **No entra lo que ya está cerrado** ni lo que alguien ya anotó a mano con otras palabras (ver
 *   parecidas.ts): un tablero con la misma tarea dos veces deja de usarse.
 */

export interface IssueDeGitHub {
  readonly numero: number;
  readonly titulo: string;
  readonly cuerpo: string;
  readonly url: string;
  readonly autor?: string;
  readonly etiquetas?: readonly string[];
}

/** Más que esto de una vez no es traer los issues, es mudar el repositorio. */
export const TOPE_DE_ISSUES = 30;

export type ResultadoDeIssues =
  | { readonly ok: true; readonly nuevas: readonly Tarjeta[]; readonly yaEstaban: number }
  | { readonly ok: false; readonly porQue: string };

/** El issue #N tal como queda anotado en el detalle: es la huella que evita traerlo dos veces. */
const marcaDeIssue = (numero: number) => `GitHub #${numero}`;

/** Lee los issues abiertos del repo con `gh`. Si no hay sesión o no es un repo de GitHub, lo dice. */
export async function issuesAbiertos(repo: string, etiqueta?: string, gh: PreguntarAGh = preguntarAGh): Promise<IssueDeGitHub[]> {
  const args = ["issue", "list", "--state", "open", "--limit", String(TOPE_DE_ISSUES), "--json", "number,title,body,url,author,labels"];
  if (etiqueta) args.push("--label", etiqueta);
  const crudo = await gh(repo, args);
  const leidos = JSON.parse(crudo.trim() || "[]") as {
    number?: unknown;
    title?: unknown;
    body?: unknown;
    url?: unknown;
    author?: { login?: unknown };
    labels?: { name?: unknown }[];
  }[];
  return leidos.flatMap((i) =>
    typeof i.number === "number" && typeof i.title === "string"
      ? [
          {
            numero: i.number,
            titulo: i.title,
            cuerpo: typeof i.body === "string" ? i.body : "",
            url: typeof i.url === "string" ? i.url : "",
            ...(typeof i.author?.login === "string" ? { autor: i.author.login } : {}),
            ...(Array.isArray(i.labels) ? { etiquetas: i.labels.flatMap((l) => (typeof l?.name === "string" ? [l.name] : [])) } : {}),
          },
        ]
      : [],
  );
}

/** Trae los issues abiertos al tablero como tarjetas. */
export async function issuesAlTablero(
  repo: string,
  { etiqueta, gh = preguntarAGh, tope = TOPE_DE_ISSUES }: { readonly etiqueta?: string; readonly gh?: PreguntarAGh; readonly tope?: number } = {},
): Promise<ResultadoDeIssues> {
  let issues: IssueDeGitHub[];
  try {
    issues = await issuesAbiertos(repo, etiqueta, gh);
  } catch (error) {
    // Sin `gh`, sin sesión o sin remoto de GitHub: se dice qué falta, no se rompe.
    const dicho = error instanceof Error ? error.message : String(error);
    return { ok: false, porQue: /not found|no such|ENOENT/i.test(dicho) ? "no encuentro «gh»: instalá la CLI de GitHub y hacé gh auth login" : dicho.trim() || "no pude leer los issues" };
  }

  const tablero = await leerTablero(repo).catch(() => [] as Tarjeta[]);
  const conocidos = new Set(tablero.flatMap((t) => [...(t.detalle ?? "").matchAll(/GitHub #(\d+)/g)].map((m) => Number(m[1]))));
  const nuevas: Tarjeta[] = [];
  let yaEstaban = 0;

  for (const issue of issues) {
    if (conocidos.has(issue.numero)) {
      yaEstaban += 1;
      continue;
    }
    if (yaEstaAnotada([...tablero, ...nuevas], issue.titulo)) {
      yaEstaban += 1;
      continue;
    }
    if (nuevas.length >= tope) break;
    const cuerpo = issue.cuerpo.trim();
    nuevas.push(
      await crearTarjeta(repo, {
        titulo: issue.titulo,
        detalle: [marcaDeIssue(issue.numero), issue.url, ...(cuerpo ? ["", cuerpo.slice(0, 2000)] : [])].filter(Boolean).join("\n"),
        tipo: /\b(bug|error|falla|roto|crash)\b/i.test(`${issue.titulo} ${(issue.etiquetas ?? []).join(" ")}`) ? "bug" : "tarea",
        columna: "ideas",
        origen: issue.autor ? `issue de @${issue.autor}` : "issue de GitHub",
      }),
    );
  }
  return { ok: true, nuevas, yaEstaban };
}
