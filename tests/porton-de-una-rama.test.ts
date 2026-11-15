import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { recordar } from "../src/nucleo/memoria.js";
import { baseDeLaRama, fasesDeUnaRama, probarRama } from "../src/nucleo/porton-de-una-rama.js";

/**
 * El portón pedido desde afuera: un agente que no usa Dolphin pregunta si su
 * rama pasa. Lo que se prueba acá es lo que hace confiable esa respuesta: que
 * el motivo del rebote venga en voz humana, que las fases de después no se
 * corran, que se mida el commit y no lo que haya sin commitear, y que no quede
 * un worktree colgado por haber preguntado.
 */

const correr = promisify(execFile);

async function git(repo: string, ...args: string[]): Promise<string> {
  const { stdout } = await correr("git", ["-c", "user.email=n@n", "-c", "user.name=n", ...args], { cwd: repo, windowsHide: true });
  return stdout.trim();
}

describe("el portón de una rama", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-porton-rama-"));
    // `typecheck` siempre pasa y `build` también: alcanzan para ver el orden y el corte.
    await writeFile(
      join(repo, "package.json"),
      JSON.stringify({
        name: "demo",
        scripts: {
          typecheck: `node -e "process.exit(0)"`,
          test: `node -e "const {existsSync}=require('fs');process.exit(existsSync('roto.txt')?1:0)"`,
          build: `node -e "process.exit(0)"`,
        },
      }),
    );
    await writeFile(join(repo, "leeme.txt"), "hola\n");
    await git(repo, "init", "-q", "-b", "main");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-qm", "base");
  });

  afterEach(async () => {
    await git(repo, "worktree", "prune").catch(() => "");
    await borrarCarpeta(repo);
  });

  it("una rama que falla rebota con el motivo, y lo que venía después no se corre", async () => {
    await git(repo, "checkout", "-q", "-b", "mala");
    await writeFile(join(repo, "roto.txt"), "rompo el test\n");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-qm", "rompo");
    await git(repo, "checkout", "-q", "main");

    const probada = await probarRama(repo, "mala");

    expect(probada.paso).toBe(false);
    expect(probada.rebote?.fase).toBe("test");
    expect(probada.rebote?.porQue).toContain("test");
    // typecheck corrió antes y pasó; build venía después del rebote y no corrió.
    expect(probada.fases.map((f) => f.nombre)).toEqual(["typecheck", "test"]);
    expect(probada.fases[0]).toMatchObject({ nombre: "typecheck", paso: true });
    expect(probada.sinCorrer).toContain("build");
    // Y se dice qué quedó sin correr por caro, en vez de hacerlo pasar por pasado.
    expect(probada.sinCorrerPorqueCuestan).toContain("revisión");
  });

  it("una rama que pasa lo dice, con todas sus fases", async () => {
    await git(repo, "checkout", "-q", "-b", "buena");
    await writeFile(join(repo, "suma.txt"), "sumo sin romper nada\n");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-qm", "sumo");
    await git(repo, "checkout", "-q", "main");

    const probada = await probarRama(repo, "buena");

    expect(probada.paso).toBe(true);
    expect(probada.rebote).toBeUndefined();
    expect(probada.fases.map((f) => f.nombre)).toEqual(["typecheck", "test", "build"]);
    expect(probada.fases.every((f) => f.paso)).toBe(true);
    expect(probada.commit).toBe(await git(repo, "rev-parse", "buena"));
  });

  it("prueba el commit de la rama, no lo que haya sin commitear", async () => {
    await git(repo, "checkout", "-q", "-b", "buena");
    await writeFile(join(repo, "suma.txt"), "sumo\n");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-qm", "sumo");
    await git(repo, "checkout", "-q", "main");
    // Sin commitear: el archivo que hace fallar al test. No es de la rama.
    await writeFile(join(repo, "roto.txt"), "esto no está commiteado\n");

    const probada = await probarRama(repo, "buena");

    expect(probada.paso).toBe(true);
    // Y sigue ahí: preguntar no toca el árbol de trabajo de nadie.
    expect(await git(repo, "status", "--porcelain")).toContain("roto.txt");
  });

  it("una corrección vieja corta la rama: la base es de dónde salió, no su propia punta", async () => {
    await recordar(repo, "nunca dejar console.log", "console\\.log");
    await git(repo, "checkout", "-q", "-b", "con-log");
    await writeFile(join(repo, "app.js"), "console.log('ups')\n");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-qm", "log");
    // El repo queda parado EN la rama que se prueba: el caso en que el ancestro
    // común es la propia punta y un diff mal medido no vería nada.

    const probada = await probarRama(repo, "con-log");

    expect(probada.base).toBe(await git(repo, "rev-parse", "con-log^"));
    expect(probada.paso).toBe(false);
    expect(probada.rebote?.fase).toContain("memoria");
    expect(probada.rebote?.porQue).toContain("console.log");
  });

  it("no deja worktrees colgados, ni cuando la rama rebota", async () => {
    await git(repo, "checkout", "-q", "-b", "mala");
    await writeFile(join(repo, "roto.txt"), "rompo\n");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-qm", "rompo");
    await git(repo, "checkout", "-q", "main");

    await probarRama(repo, "mala");

    const worktrees = (await git(repo, "worktree", "list")).split("\n").filter((l) => l.trim());
    expect(worktrees).toHaveLength(1);
  });

  it("pedir una rama que no existe dice qué rama y en qué repo", async () => {
    await expect(probarRama(repo, "fantasma")).rejects.toThrow(/no existe la rama «fantasma»/);
  });

  it("las fases se pueden mirar antes de escribir, con su costo y las de la memoria adentro", async () => {
    await recordar(repo, "nunca dejar console.log", "console\\.log");

    const fases = await fasesDeUnaRama(repo);

    expect(fases.every((f) => f.costo === "gratis")).toBe(true);
    expect(fases.map((f) => f.nombre)).toContain("typecheck");
    expect(fases.some((f) => f.nombre.startsWith("memoria:"))).toBe(true);
  });

  it("la base de una rama es el ancestro común con HEAD", async () => {
    await git(repo, "checkout", "-q", "-b", "rama");
    await writeFile(join(repo, "a.txt"), "a\n");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-qm", "a");
    await git(repo, "checkout", "-q", "main");
    await writeFile(join(repo, "b.txt"), "b\n");
    await git(repo, "add", "-A");
    await git(repo, "commit", "-qm", "b");

    const commit = await git(repo, "rev-parse", "rama");
    expect(await baseDeLaRama(repo, "rama", commit)).toBe(await git(repo, "merge-base", "rama", "HEAD"));
  });
});
