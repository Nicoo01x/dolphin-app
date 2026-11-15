import { sumarAsuntos } from "./bandeja.js";
import { preguntarAGh, type PreguntarAGh } from "./vista-git.js";

export interface IssueDeLaNoche {
  readonly numero: number;
  readonly titulo: string;
  readonly cuerpo: string;
  readonly autor?: string;
  readonly creado: string;
  readonly url: string;
}

export function pendientesDeIssues(issues: readonly IssueDeLaNoche[]): { readonly id: string; readonly titulo: string; readonly tarea: string; readonly issue: number; readonly issueUrl: string }[] {
  return issues.map((issue) => ({
    id: `issue-${issue.numero}`,
    titulo: `#${issue.numero} · ${issue.titulo}`,
    tarea: [issue.titulo, issue.cuerpo.trim(), `(issue: ${issue.url})`].filter(Boolean).join("\n"),
    issue: issue.numero,
    issueUrl: issue.url,
  }));
}

export type ResultadoDeIssuesDeNoche =
  | { readonly disponible: true; readonly propios: readonly IssueDeLaNoche[]; readonly ajenos: readonly IssueDeLaNoche[] }
  | { readonly disponible: false; readonly porQue: string };

/**
 * Issues etiquetados: solo los que abriste vos (el usuario con sesión en `gh`) entran a una noche
 * automática. No el dueño del repo: en uno de una organización el dueño es la organización, que
 * nunca abre issues, y la noche no tomaba ninguno.
 */
export async function issuesParaLaNoche(repo: string, etiqueta = "dolphin", gh: PreguntarAGh = preguntarAGh): Promise<ResultadoDeIssuesDeNoche> {
  try {
    const login = (await gh(repo, ["api", "user", "--jq", ".login"])).trim();
    if (!login) return { disponible: false, porQue: "GitHub no dijo con qué usuario tiene sesión gh" };
    const crudo = await gh(repo, ["issue", "list", "--label", etiqueta, "--state", "open", "--limit", "100", "--json", "number,title,body,author,createdAt,url"]);
    const issues = JSON.parse(crudo) as { number?: number; title?: string; body?: string; author?: { login?: string }; createdAt?: string; url?: string }[];
    const todos = issues
      .filter((i): i is { number: number; title: string; body?: string; author?: { login?: string }; createdAt: string; url: string } => Boolean(i.number && i.title && i.createdAt && i.url))
      .map((i) => ({ numero: i.number, titulo: i.title, cuerpo: i.body ?? "", ...(i.author?.login ? { autor: i.author.login } : {}), creado: i.createdAt, url: i.url }));
    const propios = todos.filter((i) => i.autor?.toLowerCase() === login.toLowerCase()).sort((a, b) => a.creado.localeCompare(b.creado));
    const ajenos = todos.filter((i) => !propios.includes(i));
    if (ajenos.length > 0) {
      await sumarAsuntos(repo, ajenos.map((i) => ({
        tipo: "idea" as const,
        titulo: `Issue #${i.numero}: ${i.titulo}`,
        detalle: [i.cuerpo.trim(), `Issue: ${i.url}`].filter(Boolean).join("\n\n"),
        origen: "github",
        fuentes: [{ titulo: `Issue #${i.numero}`, url: i.url }],
      })));
    }
    return { disponible: true, propios, ajenos };
  } catch (error) {
    return { disponible: false, porQue: `no pude leer los issues: ${error instanceof Error ? error.message : String(error)}` };
  }
}
