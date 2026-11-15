import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { App } from "../src/tui/app.js";
import { Sesion } from "../src/tui/sesion.js";
import { leerEntrada } from "../src/tui/teclas.js";

/**
 * Revisar rápido, con git de verdad: la rama del equipo se ve agrupada por compañero (qué archivos
 * tocó cada uno y cuánto), y desde la pestaña Equipo se integra a tu rama o se descarta.
 */

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-revisar-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module", scripts: { sintaxis: "node --check src/a.js" } }));
  await writeFile(join(repo, "src", "a.js"), "export const suma = (a, b) => a + b\n");
  await git(["init", "-q", "-b", "main"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});

afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

const teclear = async (app: App, crudo: string) => {
  for (const e of leerEntrada(crudo)) await app.manejar(e);
};
const texto = (app: App) => app.dibujar(140, 44).comoTexto().join("\n");

describe("revisar e integrar lo del equipo", () => {
  it("agrupa los cambios por compañero, y con «i» los lleva a tu rama", async () => {
    const app = new App(new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] }));
    await teclear(app, "/equipo exportar a CSV\r");
    const cambios = await app.sesion.cambiosDelEquipo();
    expect(cambios).toHaveLength(3);
    for (const c of cambios) {
      expect(c.archivos).toHaveLength(1);
      expect(c.archivos[0]!.ruta).toMatch(/^dolphin-.*\.txt$/);
      expect(c.agregadas).toBeGreaterThan(0);
    }

    await teclear(app, "3");
    expect(texto(app)).toContain("r: revisar e integrar");
    await teclear(app, "r");
    const revision = texto(app);
    expect(revision).toContain("→ main");
    for (const nombre of ["backend", "ux", "tests"]) expect(revision).toContain(nombre);
    expect(revision).toContain("i integrar a main");

    await teclear(app, "i");
    expect(app.sesion.mensajes.at(-1)?.texto).toContain("ya está en main");
    // Los tres archivos están en main, con un merge que lo dice.
    expect((await readdir(repo)).filter((n) => n.startsWith("dolphin-"))).toHaveLength(3);
    expect((await git(["log", "-1", "--format=%s"], repo)).stdout).toMatch(/^Mergea /);
    // No se integra dos veces: ya no hay rama ni worktree.
    await app.sesion.recibir("/integrar");
    expect(app.sesion.mensajes.at(-1)?.texto).toContain("No hay una rama del equipo");
  }, 120_000);

  it("descartar pide confirmar con otra x, y no toca tu rama", async () => {
    const app = new App(new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] }));
    await teclear(app, "/equipo exportar a CSV\r");
    const rama = app.sesion.equipo!.fin!.rama!;
    await teclear(app, "3");
    await teclear(app, "r");
    await teclear(app, "x");
    expect(texto(app)).toContain("x otra vez para descartar");
    await teclear(app, "x");
    expect((await git(["branch", "--list", rama], repo)).stdout.trim()).toBe("");
    expect((await readdir(repo)).filter((n) => n.startsWith("dolphin-"))).toHaveLength(0);
    expect(app.sesion.mensajes.at(-1)?.texto).toContain("reflog");
  }, 120_000);
});
