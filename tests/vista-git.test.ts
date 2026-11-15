import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { commitsDeLaRama, commitsDelRepo, issuesDelRepo, loginDeEmail, persona, prsPorRama, ramasDelRepo, repoDeUrlDeIssue, type PreguntarAGh } from "../src/nucleo/vista-git.js";

let repo = "";
const g = (args: string[], quien = ["Nico", "1234+nico@users.noreply.github.com"]) =>
  execFileSync("git", args, {
    cwd: repo,
    env: { ...process.env, GIT_AUTHOR_NAME: quien[0], GIT_AUTHOR_EMAIL: quien[1], GIT_COMMITTER_NAME: quien[0], GIT_COMMITTER_EMAIL: quien[1] },
  }).toString();

describe("lo que la consola muestra de un repo de git", () => {
  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-vista-git-"));
    g(["init", "-q", "-b", "main"]);
    await writeFile(join(repo, "a.txt"), "1");
    g(["add", "."]);
    g(["commit", "-qm", "primer commit"]);
    // Una rama con trabajo de dos personas, sin integrar.
    g(["checkout", "-qb", "dolphin/siembra-1"]);
    await writeFile(join(repo, "b.txt"), "2");
    g(["add", "."]);
    g(["commit", "-qm", "agrega b"]);
    g(["commit", "-q", "--allow-empty", "-m", "ajuste de Ana"], ["Ana", "ana@ejemplo.com"]);
    // Una rama ya integrada.
    g(["checkout", "-q", "main"]);
    g(["checkout", "-qb", "vieja"]);
    g(["checkout", "-q", "main"]);
  });
  afterAll(async () => {
    await borrarCarpeta(repo);
  });

  it("saca el usuario de GitHub solo de un mail noreply, nunca lo adivina", () => {
    expect(loginDeEmail("1234+nico@users.noreply.github.com")).toBe("nico");
    expect(loginDeEmail("nico@users.noreply.github.com")).toBe("nico");
    expect(loginDeEmail("nico@gmail.com")).toBeUndefined();
    expect(persona("Ana", "ana@ejemplo.com")).toEqual({ nombre: "Ana" });
    expect(persona("Nico", "1234+nico@users.noreply.github.com").avatar).toBe("https://github.com/nico.png?size=64");
  });

  it("lista las ramas con quién trabajó, cuánto le falta integrar y si ya está mergeada", async () => {
    const prs: PreguntarAGh = async () => JSON.stringify([{ number: 7, headRefName: "dolphin/siembra-1", state: "OPEN", url: "https://github.com/x/y/pull/7" }]);
    const ramas = await ramasDelRepo(repo, 60, await prsPorRama(repo, prs));
    const siembra = ramas.find((r) => r.nombre === "dolphin/siembra-1")!;
    expect(siembra).toMatchObject({ deDolphin: true, adelante: 2, atras: 0, mergeada: false, mensaje: "ajuste de Ana", pr: { numero: 7, estado: "open" } });
    expect(siembra.autores.map((a) => a.nombre).sort()).toEqual(["Ana", "Nico"]);
    expect(ramas.find((r) => r.nombre === "main")).toMatchObject({ actual: true, adelante: 0 });
    expect(ramas.find((r) => r.nombre === "vieja")).toMatchObject({ mergeada: true, deDolphin: false });
  });

  it("lista los commits de una rama con las ramas que apuntan a cada uno", async () => {
    const commits = await commitsDelRepo(repo, "dolphin/siembra-1");
    expect(commits.map((c) => c.mensaje)).toEqual(["ajuste de Ana", "agrega b", "primer commit"]);
    expect(commits[0]!.refs).toContain("dolphin/siembra-1");
    expect(commits[2]!.refs).toEqual(expect.arrayContaining(["main", "vieja"]));
    expect(commits[1]!.autor).toMatchObject({ nombre: "Nico", login: "nico" });
  });

  it("los issues vienen de gh; sin gh dice por qué en vez de fallar", async () => {
    const gh: PreguntarAGh = async () =>
      JSON.stringify([
        { number: 3, title: "El portón no corre en Windows", state: "OPEN", labels: [{ name: "bug" }], assignees: [{ login: "nico", name: "Nico" }], author: { login: "ana" }, createdAt: "2026-10-20T10:00:00Z", url: "u" },
      ]);
    const r = await issuesDelRepo(repo, gh);
    expect(r).toMatchObject({ disponible: true, issues: [{ numero: 3, abierto: true, etiquetas: ["bug"], asignados: [{ login: "nico" }], autor: { login: "ana" } }] });
    // Un gh viejo que no devuelve updatedAt no deja la fecha en blanco: queda la de siempre.
    expect(r.disponible === true && r.issues[0]!.actualizado).toBe("2026-10-20T10:00:00Z");

    const sinGh: PreguntarAGh = async () => {
      throw Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" });
    };
    const sin = await issuesDelRepo(repo, sinGh);
    expect(sin).toMatchObject({ disponible: false });
    expect(sin.disponible === false && sin.porQue).toContain("gh auth login");
    expect((await prsPorRama(repo, sinGh)).size).toBe(0);
  });

  it("cada issue trae cuándo se movió, de qué repo es y con quién está logueado gh", async () => {
    const gh: PreguntarAGh = async (_repo, args) =>
      args[0] === "api"
        ? "Nicoo01x\n"
        : JSON.stringify([
            {
              number: 37083,
              title: "Dolphin abre powershell cada 2 s",
              state: "OPEN",
              labels: [],
              assignees: [],
              author: { login: "jkutasi" },
              createdAt: "2026-10-20T10:00:00Z",
              updatedAt: "2026-11-01T09:47:00Z",
              url: "https://github.com/Nicoo01x/dolphin-app/issues/37083",
            },
          ]);
    const r = await issuesDelRepo(repo, gh);
    expect(r).toMatchObject({ disponible: true, repo: "Nicoo01x/dolphin-app", nuevoIssue: "https://github.com/Nicoo01x/dolphin-app/issues/new", yo: "Nicoo01x" });
    expect(r.disponible === true && r.issues[0]!.actualizado).toBe("2026-11-01T09:47:00Z");
  });

  it("si no se sabe con quién está logueado gh, no se inventa un «yo»", async () => {
    // Una lista JSON no es un login, y «asignados a mí» con un login inventado filtraría a cero
    // sin decir por qué.
    const gh: PreguntarAGh = async () => JSON.stringify([]);
    const r = await issuesDelRepo(repo, gh);
    expect(r).toMatchObject({ disponible: true });
    expect(r.disponible === true && r.yo).toBeUndefined();
  });

  it("el repo y el «issue nuevo» salen de la URL del issue, no de github.com escrito a mano", () => {
    expect(repoDeUrlDeIssue("https://github.com/Nicoo01x/dolphin-app/issues/7")).toEqual({
      repo: "Nicoo01x/dolphin-app",
      nuevo: "https://github.com/Nicoo01x/dolphin-app/issues/new",
    });
    // GitHub Enterprise: el host es de la empresa y el botón tiene que llevar ahí.
    expect(repoDeUrlDeIssue("https://github.empresa.com/equipo/repo.js/issues/7")).toEqual({
      repo: "equipo/repo.js",
      nuevo: "https://github.empresa.com/equipo/repo.js/issues/new",
    });
    expect(repoDeUrlDeIssue("u")).toBeUndefined();
    expect(repoDeUrlDeIssue("https://github.com/soloundueño")).toBeUndefined();
    expect(repoDeUrlDeIssue("javascript:alert(1)//a/b")).toBeUndefined();
  });
});

describe("el detalle de una rama que mergeó la base", () => {
  let otro = "";
  // Cada commit con su fecha: `git log` ordena por fecha y eso es lo que mezclaba los propios con los de la base.
  const en = (args: string[], dia: number) => {
    const fecha = `2026-10-${String(dia).padStart(2, "0")}T12:00:00Z`;
    execFileSync("git", args, {
      cwd: otro,
      env: { ...process.env, GIT_AUTHOR_NAME: "Nico", GIT_AUTHOR_EMAIL: "n@n", GIT_COMMITTER_NAME: "Nico", GIT_COMMITTER_EMAIL: "n@n", GIT_AUTHOR_DATE: fecha, GIT_COMMITTER_DATE: fecha },
    });
  };

  beforeAll(async () => {
    otro = await mkdtemp(join(tmpdir(), "dolphin-vista-git-merge-"));
    en(["init", "-q", "-b", "main"], 1);
    en(["commit", "-q", "--allow-empty", "-m", "base"], 1);
    en(["checkout", "-qb", "rama"], 2);
    en(["commit", "-q", "--allow-empty", "-m", "propio 1"], 2);
    en(["checkout", "-q", "main"], 3);
    en(["commit", "-q", "--allow-empty", "-m", "de la base"], 3);
    en(["checkout", "-q", "rama"], 4);
    en(["merge", "-q", "--no-ff", "-m", "trae la base", "main"], 4);
    en(["checkout", "-q", "main"], 5);
    en(["commit", "-q", "--allow-empty", "-m", "la base siguió"], 5);
  });
  afterAll(async () => {
    await borrarCarpeta(otro);
  });

  it("los propios salen de base..rama y después los que ya comparte con la base", async () => {
    // Por fecha, `git log rama` trae «de la base» antes que «propio 1»: cortar por cantidad los cruzaba.
    expect((await commitsDelRepo(otro, "rama")).map((c) => c.mensaje)).toEqual(["trae la base", "de la base", "propio 1", "base"]);
    const { commits, propios } = await commitsDeLaRama(otro, "rama");
    expect(commits.map((c) => c.mensaje)).toEqual(["trae la base", "propio 1", "de la base", "base"]);
    expect(propios).toBe(2);
    // La base misma: sus últimos commits, sin separar.
    expect(await commitsDeLaRama(otro, "main", 2)).toEqual({ commits: expect.any(Array) });
    expect((await commitsDeLaRama(otro, "rama", 1)).commits.map((c) => c.mensaje)).toEqual(["trae la base"]);
  });
});
