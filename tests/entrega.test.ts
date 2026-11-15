import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { leerDiff } from "../src/nucleo/diff.js";
import {
  descartarRama,
  entregadorDeGit,
  estadoDeRama,
  mensajeDeEntrega,
  restoDeTarea,
  tituloDeTarea,
  mergearRama,
  ramaActual,
  type RamaEntregada,
} from "../src/nucleo/entrega.js";
import { TallerDeGit } from "../src/nucleo/taller.js";

/**
 * Una rama entregada, como en DOLPHIN: probada → mergeada o descartada, y el
 * estado se le pregunta a git. Mergear toca el repo de verdad, así que con
 * cuidado: nada con cambios sin commitear, nada en otra rama, y un merge que
 * choca se aborta sin dejar rastro.
 */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();

describe("la entrega de una rama", () => {
  let repo = "";
  let carpeta = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-entrega-"));
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-entrega-wt-"));
    await writeFile(join(repo, "plata.ts"), "export const iva = 0.21;\n");
    await git(["init", "-q", "-b", "main"], repo);
    await git(["config", "user.email", "nico@ejemplo.com"], repo);
    await git(["config", "user.name", "Nico"], repo);
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "base"], repo);
  });

  afterEach(async () => {
    await git(["worktree", "prune"], repo).catch(() => "");
    await borrarCarpeta(repo);
    await borrarCarpeta(carpeta);
  });

  /** Una rama sembrada y entregada que cambia plata.ts. */
  const entregar = async (contenido: string, id = "u1"): Promise<{ entregada: RamaEntregada; ruta: string }> => {
    const base = await git(["rev-parse", "HEAD"], repo);
    const universo = await new TallerDeGit(repo, carpeta).abrir(id, `dolphin/s${id}`);
    await writeFile(join(universo.ruta, "plata.ts"), contenido);
    const commit = await entregadorDeGit(repo).commitear(universo.ruta, mensajeDeEntrega("Arreglá el IVA"));
    return { entregada: { rama: universo.rama, commit, base, ramaBase: "main" }, ruta: universo.ruta };
  };

  it("el mensaje es la primera línea de la tarea, corta: un pedido armado de la bandeja tiene decenas", () => {
    expect(mensajeDeEntrega("Arreglá este error: el botón no anda\n\nQué pasa:\n...")).toBe("dolphin: Arreglá este error: el botón no anda");
    expect(mensajeDeEntrega("x".repeat(120))).toHaveLength("dolphin: ".length + 72);
    expect(mensajeDeEntrega("  \n ")).toBe("dolphin: trabajo de dolphin");
    // El título y lo que vio el agente además, separados: el resto se lee abriendo «El pedido entero».
    const tarea = "\n  Arreglá el IVA  \nQué pasa:\n- cobra dos veces\n";
    expect(tituloDeTarea(tarea)).toBe("Arreglá el IVA");
    expect(restoDeTarea(tarea)).toBe("Qué pasa:\n- cobra dos veces");
    expect(restoDeTarea("Arreglá el IVA")).toBe("");
  });

  it("entregar dos veces no es un error: devuelve el mismo commit", async () => {
    const { entregada, ruta } = await entregar("export const iva = 0.105;\n");
    expect(await entregadorDeGit(repo).commitear(ruta, "otra vez")).toBe(entregada.commit);
  });

  it("probada → mergeada, y el commit es del dueño, sin co-autores", async () => {
    const { entregada, ruta } = await entregar("export const iva = 0.105;\n");
    expect(await estadoDeRama(repo, entregada)).toBe("probada");

    expect(await mergearRama(repo, entregada, "Arreglá el IVA", ruta)).toEqual({ ok: true });
    expect(await estadoDeRama(repo, entregada)).toBe("mergeada");
    expect(await readFile(join(repo, "plata.ts"), "utf8")).toContain("0.105");
    const autor = await git(["log", "-1", "--format=%an <%ae>%n%B", entregada.commit], repo);
    expect(autor).toContain("Nico <nico@ejemplo.com>");
    expect(autor).not.toMatch(/co-authored-by/i);

    // Mergeada, se van su worktree y su rama: con el modo live se juntaba uno por cada cambio.
    expect(existsSync(ruta)).toBe(false);
    expect(await git(["branch", "--list", entregada.rama], repo)).toBe("");
    // Lo que entró se sigue pudiendo leer: de los commits, no del worktree.
    const diff = await leerDiff(ruta, { commits: { repo, base: entregada.base, commit: entregada.commit } });
    expect(diff.texto).toContain("+export const iva = 0.105;");
  });

  it("si alguien tocó el worktree después de la entrega, mergea pero no lo borra", async () => {
    const { entregada, ruta } = await entregar("export const iva = 0.105;\n");
    await writeFile(join(ruta, "nota.md"), "a medio escribir\n");
    expect(await mergearRama(repo, entregada, "Arreglá el IVA", ruta)).toEqual({ ok: true });
    expect(await estadoDeRama(repo, entregada)).toBe("mergeada");
    expect(await readFile(join(ruta, "nota.md"), "utf8")).toBe("a medio escribir\n");
  });

  it("con cambios sin commitear en el repo, no toca nada", async () => {
    const { entregada } = await entregar("export const iva = 0.105;\n");
    await writeFile(join(repo, "otro.ts"), "a medio hacer\n");
    const r = await mergearRama(repo, entregada, "Arreglá el IVA");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.porQue).toContain("cambios sin commitear");
    expect(await estadoDeRama(repo, entregada)).toBe("probada");
  });

  it("parado en otra rama, no mergea en la equivocada", async () => {
    const { entregada } = await entregar("export const iva = 0.105;\n");
    await git(["checkout", "-q", "-b", "experimento"], repo);
    const r = await mergearRama(repo, entregada, "Arreglá el IVA");
    expect(!r.ok && r.porQue).toContain("pasate a «main»");
    expect(await ramaActual(repo)).toBe("experimento");
  });

  it("un merge que choca se aborta sin dejar rastro, y dice dónde", async () => {
    const { entregada } = await entregar("export const iva = 0.105;\n");
    // Mientras tanto, alguien cambió la misma línea en main.
    await writeFile(join(repo, "plata.ts"), "export const iva = 0.27;\n");
    await git(["commit", "-qam", "otro cambio en main"], repo);

    const r = await mergearRama(repo, entregada, "Arreglá el IVA");
    expect(!r.ok && r.porQue).toContain("plata.ts");
    expect(await git(["status", "--porcelain"], repo)).toBe("");
    expect(await readFile(join(repo, "plata.ts"), "utf8")).toContain("0.27");
  });

  it("descartar se lleva la rama y el worktree", async () => {
    const { entregada, ruta } = await entregar("export const iva = 0.105;\n");
    await descartarRama(repo, entregada, ruta);
    expect(await estadoDeRama(repo, entregada)).toBe("descartada");
  });

  it("el diff de una rama entregada sigue mostrando el cambio, contra su base", async () => {
    const { ruta } = await entregar("export const iva = 0.105;\n");
    const diff = await leerDiff(ruta);
    expect(diff.hay).toBe(true);
    expect(diff.texto).toContain("+export const iva = 0.105;");
    expect(diff.texto).toContain("-export const iva = 0.21;");
  });
});
