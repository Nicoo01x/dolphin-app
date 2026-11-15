import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { App } from "../src/tui/app.js";
import { Sesion } from "../src/tui/sesion.js";
import { leerEntrada } from "../src/tui/teclas.js";

/**
 * Deshacer por partes, con git de verdad: un equipo de tres integra su trabajo; se deshace uno solo
 * y los otros dos quedan, y el portón vuelve a pasar sobre lo que queda.
 */

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-deshacer-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module", scripts: { sintaxis: "node --check src/a.js" } }));
  await writeFile(join(repo, "src", "a.js"), "export const suma = (a, b) => a + b\n");
  await git(["init", "-q"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});

afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

/** Los archivos que dejó cada compañero en la rama de integración (el de mentira escribe uno por tarea). */
const archivosDelEquipo = async (ruta: string) => (await readdir(ruta)).filter((n) => n.startsWith("dolphin-")).sort();

describe("deshacer por partes", () => {
  it("se deshace un compañero y quedan los otros dos, con el portón pasando de nuevo", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] });
    await sesion.recibir("/equipo exportar a CSV");
    const ruta = sesion.equipo?.fin?.ruta;
    expect(ruta).toBeTruthy();
    const antes = await archivosDelEquipo(ruta!);
    expect(antes).toHaveLength(3);
    expect(sesion.equipo?.tareas.every((t) => t.estado === "integrada" && t.commit)).toBe(true);

    await sesion.recibir("/deshacer ux");
    const despues = await archivosDelEquipo(ruta!);
    expect(despues).toHaveLength(2);
    const ux = sesion.equipo!.tareas.find((t) => t.dueno === "ux")!;
    expect(ux.estado).toBe("deshecha");
    expect(despues).toEqual(antes.filter((n) => n.includes("lo-que-se-ve") === false));
    expect(sesion.mensajes.at(-1)?.texto).toContain("lo que queda pasa el portón");
    // El revert es un commit más: la historia no se reescribe.
    const log = (await git(["log", "--oneline", "-1"], ruta!)).stdout;
    expect(log).toMatch(/Revert/);
    // Volver a pedirlo no hace nada: ya no tiene trabajo integrado.
    await sesion.recibir("/deshacer ux");
    expect(sesion.mensajes.at(-1)?.texto).toContain("no tiene trabajo integrado");
  }, 120_000);

  it("desde la pestaña Equipo: elegir el compañero y apretar d", async () => {
    const app = new App(new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] }));
    for (const e of leerEntrada("/equipo exportar a CSV\r")) await app.manejar(e);
    for (const e of leerEntrada("3\x1b[C")) await app.manejar(e);
    expect(app.dibujar(140, 40).comoTexto().join("\n")).toContain("enter su terminal · d deshacer");
    // Deshacer no se hace con una sola tecla: la primera «d» avisa, la segunda confirma.
    for (const e of leerEntrada("d")) await app.manejar(e);
    expect(app.dibujar(140, 40).comoTexto().join("\n")).toContain("d otra vez para deshacer");
    expect(app.sesion.equipo?.tareas.some((t) => t.estado === "deshecha")).toBe(false);
    for (const e of leerEntrada("d")) await app.manejar(e);
    // Deshacer corre en segundo plano (git revert de verdad): se espera a que la tarea quede deshecha.
    const deshecha = () => !!app.sesion.equipo?.tareas.some((t) => t.estado === "deshecha");
    await esperarA(deshecha, { tope: 30_000 });
    expect(deshecha(), "no se deshizo").toBe(true);
    expect(app.sesion.equipo?.tareas.filter((t) => t.estado === "integrada")).toHaveLength(2);
  }, 120_000);
});
