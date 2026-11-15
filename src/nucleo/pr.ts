import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { mensajeDeEntrega } from "./entrega.js";
import { armarInforme, fasesDePasadas, informeEnMarkdown } from "./informe.js";
import type { Cosecha } from "./tipos.js";

export { vigilarPr } from "./pr-vigilar.js";
export type { CorreccionDePr, OpcionesDeVigilarPr, PrVigilado, ResultadoDeVigilarPr } from "./pr-vigilar.js";

/**
 * El PR automático y de issue a siembra.
 *
 * La rama elegida se abre como draft PR y la descripción es la EVIDENCIA
 * del portón —qué hizo, qué fases pasó, qué tocó—: quien revisa ve por qué
 * esa rama está probada sin abrir Dolphin. Y un issue se puede sembrar
 * directo: su título y su cuerpo son la tarea.
 *
 * Los comandos (git y gh) entran por parámetro: así se prueba exactamente
 * qué se correría sin publicar nada en GitHub.
 */

/** Con un tope: un `git push` o un `ssh` colgado no deja esperando para siempre a quien lo lanzó. */
export interface OpcionesDeCorrer {
  readonly tope?: number;
  readonly senal?: AbortSignal;
}

export type Correr = (cmd: string, args: readonly string[], cwd: string, opciones?: OpcionesDeCorrer) => Promise<string>;

/** Lo de red sin tope propio: dos minutos alcanzan para un push o un PR, y ninguno pregunta nada. */
const TOPE_POR_DEFECTO = 120_000;

const ejecutar = promisify(execFile);
export const correrDeVerdad: Correr = async (cmd, args, cwd, opciones = {}) =>
  (
    await ejecutar(cmd, [...args], {
      cwd,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
      timeout: opciones.tope ?? TOPE_POR_DEFECTO,
      ...(opciones.senal ? { signal: opciones.senal } : {}),
      // Sin terminal que conteste: un git que pide usuario y clave falla en vez de esperar.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    })
  ).stdout.trim();

const tiempo = (ms: number) => (ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`);

/** La descripción del PR: la evidencia del portón, en markdown. */
export function cuerpoDelPr(cosecha: Cosecha): string {
  const elegida = cosecha.ganador;
  const partes: string[] = [];
  partes.push(`## ${cosecha.tarea.split("\n")[0]}`);
  if (elegida?.contrato?.resumen) partes.push("", elegida.contrato.resumen);

  const pasadas = elegida?.pasadas ?? [];
  partes.push("", "### Las fases");
  if (pasadas.length === 0) {
    // Lo mismo que dice la consola: sin fases no hubo prueba, y el PR no lo esconde.
    partes.push("", "> Esta rama **no pasó por ninguna fase**: se entregó sin probar. Revisala con más cuidado.");
  } else {
    partes.push("", "| fase | resultado | tardó |", "| --- | --- | --- |");
    for (const p of pasadas) partes.push(`| ${p.verificador} | ${p.salteada ? "salteada" : p.paso ? "pasó" : "no pasó"} — ${p.detalle.replace(/\|/g, "/")} | ${tiempo(p.ms)} |`);
  }

  const tocados = elegida?.forma?.tocados ?? [];
  if (tocados.length > 0) {
    partes.push("", "### Lo que tocó", "");
    for (const t of tocados) partes.push(`- \`${t.ruta}\` +${t.agregadas} −${t.quitadas}`);
  }
  // El informe verificable: cómo se sabe que quedó bien, qué se comprobó y qué NO (ver informe.ts).
  partes.push(
    "",
    informeEnMarkdown(
      armarInforme({
        tarea: cosecha.tarea,
        fases: fasesDePasadas(pasadas),
        tocados: tocados.map((t) => t.ruta),
        videos: pasadas.flatMap((p) => p.videos ?? []),
      }),
    ),
  );
  if (elegida?.modelo) partes.push("", `Lo escribió **${elegida.modelo}**${elegida.deCache ? ", salió de la memoria de respuestas" : ""}.`);
  if (cosecha.candidatos.length > 1) {
    partes.push(`Se sembraron ${cosecha.candidatos.length} ramas; esta fue la elegida: ${cosecha.porQueGano ?? ""}`);
  }
  partes.push("", "---", "Sembrada y probada con dolphin.");
  return partes.join("\n");
}

export type ResultadoDePr = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly porQue: string };

/** Abre el draft de una rama o actualiza el draft que ya existe para ese head. */
export async function abrirOActualizarPr(repo: string, cosecha: Cosecha, correr: Correr = correrDeVerdad): Promise<ResultadoDePr> {
  const rama = cosecha.entregada?.rama;
  if (!rama) return { ok: false, porQue: "esta cosecha no tiene una rama entregada" };
  const existentes = await correr("gh", ["pr", "list", "--head", rama, "--state", "open", "--json", "number,url,isDraft"], repo)
    .then((salida) => JSON.parse(salida) as { number?: number; url?: string; isDraft?: boolean }[])
    .catch(() => []);
  const draft = existentes.find((pr) => pr.isDraft && pr.number && pr.url);
  if (!draft) return abrirPr(repo, cosecha, correr);

  const carpeta = await mkdtemp(join(tmpdir(), "dolphin-pr-"));
  try {
    const cuerpo = join(carpeta, "cuerpo.md");
    await writeFile(cuerpo, cuerpoDelPr(cosecha));
    await correr("git", ["push", "-u", "origin", rama], repo);
    await correr("gh", ["pr", "edit", String(draft.number), "--body-file", cuerpo], repo);
    return { ok: true, url: draft.url! };
  } catch (error) {
    const texto = String((error as { stderr?: string }).stderr ?? (error as Error).message ?? error);
    return { ok: false, porQue: texto.split("\n").find((l) => l.trim() !== "")?.trim().slice(0, 200) ?? "no se pudo actualizar el PR" };
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}

/** Deja en el issue el enlace al trabajo entregado, sin meter el cuerpo del issue en el comentario. */
export async function comentarIssue(repo: string, numero: number, pr: string, correr: Correr = correrDeVerdad): Promise<void> {
  await correr("gh", ["issue", "comment", String(numero), "--body", `Dolphin dejó el trabajo en un PR draft: ${pr}`], repo);
}

/** Sube la rama elegida y abre un draft PR contra la rama donde se sembró. */
export async function abrirPr(repo: string, cosecha: Cosecha, correr: Correr = correrDeVerdad): Promise<ResultadoDePr> {
  const entregada = cosecha.entregada;
  if (!entregada) return { ok: false, porQue: "esta cosecha no tiene una rama entregada" };

  const remoto = await correr("git", ["remote", "get-url", "origin"], repo).catch(() => "");
  if (!remoto) return { ok: false, porQue: "el repo no tiene un remoto «origin» adonde subir la rama" };

  const carpeta = await mkdtemp(join(tmpdir(), "dolphin-pr-"));
  try {
    const cuerpo = join(carpeta, "cuerpo.md");
    await writeFile(cuerpo, cuerpoDelPr(cosecha));
    await correr("git", ["push", "-u", "origin", entregada.rama], repo);
    const url = await correr(
      "gh",
      [
        "pr",
        "create",
        "--draft",
        "--head",
        entregada.rama,
        ...(entregada.ramaBase ? ["--base", entregada.ramaBase] : []),
        "--title",
        mensajeDeEntrega(cosecha.tarea).replace(/^dolphin: /, ""),
        "--body-file",
        cuerpo,
      ],
      repo,
    );
    const link = url.split("\n").find((l) => /^https?:\/\//.test(l.trim()))?.trim();
    return link ? { ok: true, url: link } : { ok: false, porQue: `gh no devolvió el link del PR: ${url.slice(0, 200)}` };
  } catch (error) {
    const texto = String((error as { stderr?: string }).stderr ?? (error as Error).message ?? error);
    return { ok: false, porQue: texto.split("\n").find((l) => l.trim() !== "")?.trim().slice(0, 200) ?? "no se pudo abrir el PR" };
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}

/** Un issue de GitHub como tarea: título, cuerpo y el link para volver a él. */
export async function tareaDeIssue(repo: string, numero: number, correr: Correr = correrDeVerdad): Promise<string> {
  const crudo = await correr("gh", ["issue", "view", String(numero), "--json", "title,body,url"], repo);
  const issue = JSON.parse(crudo) as { title?: string; body?: string; url?: string };
  if (!issue.title) throw new Error(`no encontré el issue #${numero}`);
  return [issue.title, issue.body?.trim() ? `\n${issue.body.trim()}` : "", issue.url ? `\n(issue: ${issue.url})` : ""].join("");
}
