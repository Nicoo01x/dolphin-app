import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { prepararWorktree } from "../src/nucleo/entorno.js";
import { prepararSiembra, sembrarTarea } from "../src/siembra.js";

/**
 * Cada worktree arranca listo para correr: sus .env, sus comandos de `preparar` en orden y con SU
 * entorno (un puerto propio y su DATABASE_URL), así dos compañeros levantan la app a la vez y una
 * migración no toca la base de todos. Con git de verdad y el agente de mentira.
 */

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
const anotar = (archivo: string, variable: string) => `node -e "require('fs').writeFileSync('${archivo}', String(process.env.${variable}))"`;

let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-preparar-worktree-"));
  await writeFile(join(repo, ".env"), "SECRETO=local\nDATABASE_URL=postgres://localhost:5432/tienda\n");
  await writeFile(join(repo, ".gitignore"), ".env\n*.txt\n.dolphin/\n");
  await writeFile(
    join(repo, "dolphin.config.json"),
    JSON.stringify({
      entorno: {
        dependencias: "nada",
        preparar: [anotar("puerto.txt", "APP_PORT"), anotar("base.txt", "DATABASE_URL")],
        puerto: { variable: "APP_PORT", desde: 4100 },
      },
    }),
  );
  await git(["init", "-q", "-b", "main"], repo);
  await git(["config", "user.email", "n@n"], repo);
  await git(["config", "user.name", "n"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});

afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

describe("la preparación de cada worktree", () => {
  it("dos tareas a la vez: cada una con su .env, su puerto desde 4100 y su base, ya en «preparar»", async () => {
    const pedidos = ["primera tarea", "segunda tarea"].map((tarea) => ({ repo, tarea, agente: "mentira" as const }));
    const preparadas = await Promise.all(pedidos.map(prepararSiembra));
    const resultados = await Promise.all(preparadas.map((preparada, i) => sembrarTarea(pedidos[i]!, preparada)));
    const universos = resultados.map((r) => r.cosecha.ganador!.universo);
    const puertos = universos.map((u) => u.entorno?.["APP_PORT"]);

    expect(new Set(puertos).size).toBe(2);
    expect(puertos.every((p) => Number(p) >= 4100)).toBe(true);
    expect(universos.every((u) => u.entorno?.["PORT"] === u.entorno?.["APP_PORT"])).toBe(true);
    const bases = new Set<string>();
    for (const u of universos) {
      expect(await readFile(join(u.ruta, ".env"), "utf8")).toContain("SECRETO=local");
      expect(await readFile(join(u.ruta, "puerto.txt"), "utf8")).toBe(u.entorno?.["APP_PORT"]);
      const base = await readFile(join(u.ruta, "base.txt"), "utf8");
      expect(base).not.toBe("postgres://localhost:5432/tienda");
      expect(base).toBe(u.entorno?.["DATABASE_URL"]);
      bases.add(base);
    }
    expect(bases.size).toBe(2);
  }, 90_000);

  it("los comandos van en orden y se para en el primero que falla, con su porqué", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "dolphin-preparar-solo-"));
    try {
      const preparado = await prepararWorktree(
        repo,
        worktree,
        { dependencias: "nada", preparar: [anotar("uno.txt", "X"), `node -e "console.error('la migración no anda'); process.exit(7)"`, anotar("tres.txt", "X")] },
        { entorno: { X: "hola" } },
      );
      expect(await readFile(join(worktree, "uno.txt"), "utf8")).toBe("hola");
      expect(preparado.porQue).toContain("salió con 7: la migración no anda");
      await expect(readFile(join(worktree, "tres.txt"), "utf8")).rejects.toThrow();
      // Un solo comando, como antes, sigue andando.
      const viejo = await prepararWorktree(repo, worktree, { dependencias: "nada", preparar: anotar("solo.txt", "X") }, { entorno: { X: "uno" } });
      expect(viejo.porQue).toBeUndefined();
      expect(await readFile(join(worktree, "solo.txt"), "utf8")).toBe("uno");
    } finally {
      await borrarCarpeta(worktree);
    }
  });

  it("de un repo de afuera no corre nada", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "dolphin-preparar-afuera-"));
    try {
      const preparado = await prepararWorktree(repo, worktree, { dependencias: "nada", preparar: [anotar("x.txt", "X")] }, { deAfuera: true });
      expect(preparado.pasos).toContain("no corrió «preparar»: el repo o la tarea son de afuera");
      await expect(readFile(join(worktree, "x.txt"), "utf8")).rejects.toThrow();
    } finally {
      await borrarCarpeta(worktree);
    }
  });
});
