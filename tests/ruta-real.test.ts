import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { mismaRuta, rutaReal } from "../src/nucleo/ruta-real.js";
import { olvidarEntradaDelWorktree } from "../src/nucleo/entorno.js";

/**
 * Git anota la ruta REAL de cada worktree; Dolphin arma las suyas con `os.tmpdir()`, que en el
 * runner de Windows viene corta (`C:\Users\RUNNER~1\…`) y en macOS pasa por un enlace (`/var`).
 * Un enlace (junction en Windows) hace de «otra forma de escribir la misma carpeta» en cualquier
 * sistema, sin depender de que el disco tenga nombres 8.3.
 */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();

let afuera = "";
let real = "";
let alias = "";

beforeEach(async () => {
  afuera = await mkdtemp(join(tmpdir(), "dolphin-ruta-real-"));
  real = join(afuera, "real");
  alias = join(afuera, "alias");
  await mkdir(real);
  await symlink(real, alias, "junction");
});
afterEach(async () => {
  await borrarCarpeta(afuera);
});

describe("la ruta como la escribe git", () => {
  it("pasa por el enlace, y el tramo que no existe se pega tal cual", () => {
    expect(rutaReal(join(alias, "no-existe", "wt"))).toBe(join(rutaReal(real), "no-existe", "wt"));
    expect(mismaRuta(join(alias, "wt"), join(real, "wt"))).toBe(true);
    expect(mismaRuta(join(alias, "wt"), join(real, "otro"))).toBe(false);
  });

  // Sólo en Windows y sólo si el disco del sistema tiene nombres cortos: es el caso del runner.
  it.runIf(process.platform === "win32" && existsSync("C:\\PROGRA~1"))("en Windows, un nombre corto 8.3 vuelve largo", () => {
    expect(rutaReal("C:\\PROGRA~1\\no-existe")).toBe(join(process.env["ProgramFiles"] ?? "C:\\Program Files", "no-existe"));
  });
});

describe("olvidar la entrada de un worktree cuya carpeta ya no está", () => {
  it("la encuentra aunque Dolphin la nombre por otro camino que git, y deja la de la persona", async () => {
    const repo = join(real, "repo");
    await mkdir(repo);
    await writeFile(join(repo, "a.js"), "export const a = 1;\n");
    await git(["init", "-q"], repo);
    await git(["config", "user.email", "n@n"], repo);
    await git(["config", "user.name", "n"], repo);
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "base"], repo);

    // El de Dolphin, nombrado por el alias (como Dolphin nombra los suyos con un tmpdir corto).
    const deDolphin = join(alias, "u1");
    await git(["worktree", "add", "-q", "--detach", deDolphin, "HEAD"], repo);
    // El de la persona, en un disco desenchufado: tampoco está, y no es nuestro.
    const suyo = join(real, "suyo");
    await git(["worktree", "add", "-q", "--detach", suyo, "HEAD"], repo);
    await rename(suyo, `${suyo}-lejos`);
    await borrarCarpeta(join(real, "u1"));

    await olvidarEntradaDelWorktree(repo, deDolphin);

    const lista = (await git(["worktree", "list", "--porcelain"], repo)).replace(/\\/g, "/");
    expect(lista).not.toMatch(/\/u1$/m);
    expect(lista).toMatch(/\/suyo$/m);
    await rename(`${suyo}-lejos`, suyo);
  });
});
