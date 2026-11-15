import { execFile, spawn } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { barrerHuerfanos, TRABA } from "../src/nucleo/taller.js";

/**
 * Lo que queda cuando a Dolphin lo cortan a mitad de camino: ningún
 * worktree con el enlace a node_modules puesto (borrarlo con git le vaciaba
 * al repo el suyo), y lo que quedó trabado por un proceso muerto se barre
 * la vez siguiente sin tocar lo de nadie más.
 */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();
const FIXTURE = fileURLToPath(new URL("./fixtures/abre-y-espera.ts", import.meta.url));

describe("cortar a Dolphin a mitad de camino", () => {
  let repo = "";
  let carpeta = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-cortar-"));
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-cortar-wt-"));
    await git(["init", "-q"], repo);
    await git(["config", "user.email", "nico@ejemplo.com"], repo);
    await git(["config", "user.name", "Nico"], repo);
    await writeFile(join(repo, ".gitignore"), "node_modules/\n");
    await writeFile(join(repo, "a.js"), "export const a = 1;\n");
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "base"], repo);
    await mkdir(join(repo, "node_modules", "dep"), { recursive: true });
    await writeFile(join(repo, "node_modules", "dep", "index.js"), "module.exports = 1;\n");
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
    await borrarCarpeta(carpeta);
  });

  it("«cortá» por el canal: suelta el enlace antes de irse, y el node_modules del repo queda entero", async () => {
    const hijo = spawn(process.execPath, ["--import", "tsx", FIXTURE, repo, carpeta], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
    const ruta = await new Promise<string>((listo, fallar) => {
      hijo.once("message", (m) => listo((m as { abierto: string }).abierto));
      hijo.once("exit", (codigo) => fallar(new Error(`el hijo salió antes de abrir (${codigo})`)));
    });
    expect(lstatSync(join(ruta, "node_modules")).isSymbolicLink()).toBe(true);

    const salida = new Promise<number | null>((listo) => hijo.once("exit", (codigo) => listo(codigo)));
    hijo.send({ cortar: true });
    expect(await salida).toBe(130);

    expect(existsSync(join(ruta, "node_modules"))).toBe(false); // el enlace, suelto
    expect(existsSync(join(repo, "node_modules", "dep", "index.js"))).toBe(true);

    // El worktree quedó trabado por un proceso que ya no está: la próxima siembra lo barre.
    expect(await barrerHuerfanos(repo)).toBe(1);
    expect(await git(["worktree", "list"], repo)).not.toContain("u1");
    expect(existsSync(join(repo, "node_modules", "dep", "index.js"))).toBe(true);
  }, 60_000);

  it("el barrido no toca un worktree de una siembra viva ni uno de la persona", async () => {
    const vivo = join(carpeta, "vivo");
    const suyo = join(carpeta, "suyo");
    await git(["worktree", "add", "-q", "--detach", vivo, "HEAD"], repo);
    await git(["worktree", "lock", "--reason", `${TRABA} ${process.pid}`, vivo], repo);
    await git(["worktree", "add", "-q", "--detach", suyo, "HEAD"], repo);
    await git(["worktree", "lock", "--reason", "mi disco externo", suyo], repo);

    expect(await barrerHuerfanos(repo)).toBe(0);
    const lista = await git(["worktree", "list"], repo);
    expect(lista).toContain("vivo");
    expect(lista).toContain("suyo");
    for (const ruta of [vivo, suyo]) {
      await git(["worktree", "unlock", ruta], repo);
      await git(["worktree", "remove", "--force", ruta], repo);
    }
  });

  it("suelta pero conserva ramas de equipo y de bug que tienen trabajo propio", async () => {
    const equipo = join(carpeta, "equipo");
    const bug = join(carpeta, "bug");
    const vacia = join(carpeta, "vacia");
    await git(["worktree", "add", "-q", "-b", "dolphin-equipo/guardada", equipo, "HEAD"], repo);
    await writeFile(join(equipo, "equipo.js"), "export const equipo = true\n");
    await git(["add", "-A"], equipo);
    await git(["commit", "-qm", "equipo"], equipo);
    await git(["worktree", "lock", "--reason", `${TRABA} 999999`, equipo], repo);
    await git(["worktree", "add", "-q", "-b", "dolphin-bug/reproducido", bug, "HEAD"], repo);
    await writeFile(join(bug, "bug.test.js"), "throw new Error('bug')\n");
    await git(["add", "-A"], bug);
    await git(["commit", "-qm", "reproduce"], bug);
    await git(["worktree", "lock", "--reason", `${TRABA} 999998`, bug], repo);
    await git(["worktree", "add", "-q", "-b", "dolphin-bug/vacia", vacia, "HEAD"], repo);
    await git(["worktree", "lock", "--reason", `${TRABA} 999997`, vacia], repo);

    expect(await barrerHuerfanos(repo)).toBe(3);
    expect(await git(["worktree", "list"], repo)).not.toContain("equipo");
    expect(await git(["worktree", "list"], repo)).not.toContain("bug");
    expect(await git(["show-ref", "--verify", "refs/heads/dolphin-equipo/guardada"], repo)).toContain("dolphin-equipo/guardada");
    expect(await git(["show-ref", "--verify", "refs/heads/dolphin-bug/reproducido"], repo)).toContain("dolphin-bug/reproducido");
    await expect(git(["show-ref", "--verify", "refs/heads/dolphin-bug/vacia"], repo)).rejects.toBeTruthy();
  });
});
