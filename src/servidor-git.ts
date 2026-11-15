import type { ServerResponse } from "node:http";
import { json } from "./servidor-comun.js";
import { commitsDelRepo, commitsDeLaRama, detalleDeCommit, diffDeCommit, issuesDelRepo, prsPorRama, ramasDelRepo, type PreguntarAGh } from "./nucleo/vista-git.js";
import { tareaDeIssue } from "./nucleo/pr.js";
import { gitDice } from "./nucleo/git.js";

/**
 * GET /api/git?que=ramas|commits|issues[&rama=X] · que=rama&rama=X · que=commit&hash=H ·
 * que=issue&numero=N — lo que la consola muestra de un repo de git, y lo que se ve al entrar a una
 * rama o a un commit (ver nucleo/vista-git.ts). Es de lectura: no cambia nada del repo.
 */
export async function rutaDeGit(
  ruta: string,
  url: URL,
  repo: string,
  respuesta: ServerResponse,
  gh?: PreguntarAGh,
  comoTarea: typeof tareaDeIssue = tareaDeIssue,
): Promise<boolean> {
  if (ruta !== "/api/git") return false;
  if (!(await gitDice(["rev-parse", "--is-inside-work-tree"], repo))) {
    json(respuesta, 200, { esGit: false });
    return true;
  }
  const que = url.searchParams.get("que") ?? "ramas";
  if (que === "ramas") {
    json(respuesta, 200, { esGit: true, ramas: await ramasDelRepo(repo, 60, await prsPorRama(repo, gh)) });
    return true;
  }
  if (que === "commits") {
    const rama = url.searchParams.get("rama") ?? undefined;
    // Una rama que no existe no es un 500: la lista vacía y el porqué.
    if (rama && !(await gitDice(["rev-parse", "--verify", "--quiet", rama], repo))) {
      json(respuesta, 404, { ok: false, porQue: `no hay una rama «${rama}»` });
      return true;
    }
    json(respuesta, 200, { esGit: true, commits: await commitsDelRepo(repo, rama) });
    return true;
  }
  if (que === "issues") {
    json(respuesta, 200, { esGit: true, ...(await issuesDelRepo(repo, gh)) });
    return true;
  }
  // Un issue como tarea: el título, el cuerpo y el link, que es lo que se le da a un agente para
  // que arranque. No siembra nada; la siembra la pide la consola después, con su motor elegido.
  if (que === "issue") {
    const numero = Number(url.searchParams.get("numero"));
    if (!Number.isInteger(numero) || numero < 1) {
      json(respuesta, 400, { ok: false, porQue: "numero tiene que ser el número de un issue" });
      return true;
    }
    try {
      json(respuesta, 200, { esGit: true, tarea: await comoTarea(repo, numero) });
    } catch (error) {
      json(respuesta, 404, { ok: false, porQue: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  // Para entrar: los commits de una rama (los propios primero) y lo que cambió un commit, con su diff.
  if (que === "rama") {
    const rama = url.searchParams.get("rama") ?? "";
    if (!rama || rama.startsWith("-") || !(await gitDice(["rev-parse", "--verify", "--quiet", `refs/heads/${rama}`], repo))) {
      json(respuesta, 404, { ok: false, porQue: `no hay una rama «${rama}»` });
      return true;
    }
    json(respuesta, 200, { esGit: true, ...(await commitsDeLaRama(repo, rama, 100)) });
    return true;
  }
  if (que === "commit") {
    const hash = url.searchParams.get("hash") ?? "";
    // Solo un hash: nada que git pueda leer como una opción o un rango.
    if (!/^[0-9a-f]{4,64}$/i.test(hash) || !(await gitDice(["cat-file", "-e", `${hash}^{commit}`], repo))) {
      json(respuesta, 404, { ok: false, porQue: `no hay un commit «${hash}»` });
      return true;
    }
    const [detalle, diff] = await Promise.all([detalleDeCommit(repo, hash), diffDeCommit(repo, hash)]);
    json(respuesta, 200, { esGit: true, ...detalle, diff: diff.texto, recortado: diff.recortado });
    return true;
  }
  json(respuesta, 400, { ok: false, porQue: "que tiene que ser ramas, commits, issues, issue, rama o commit" });
  return true;
}
