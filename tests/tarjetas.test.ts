import { execFile } from "node:child_process";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { buscarTarjeta, carpetaDelTablero, columnaDe, comentarTarjeta, crearTarjeta, leerTablero, moverTarjeta } from "../src/nucleo/tarjetas.js";

let repo = "";
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-tablero-"));
});
afterEach(async () => {
  await borrarCarpeta(repo);
});

describe("el tablero", () => {
  it("una tarea va a Para hacer y una idea a Ideas, cada una en su archivo", async () => {
    const tarea = await crearTarjeta(repo, { titulo: "  exportar a CSV ", terminado: "baja un .csv con las columnas visibles" }, new Date("2026-10-28T10:00:00Z"));
    const idea = await crearTarjeta(repo, { titulo: "modo oscuro", tipo: "idea" }, new Date("2026-10-28T11:00:00Z"));
    expect(tarea).toMatchObject({ titulo: "exportar a CSV", columna: "para-hacer", tipo: "tarea", origen: "vos", comentarios: [] });
    expect(idea.columna).toBe("ideas");
    expect((await readdir(carpetaDelTablero(repo))).sort()).toEqual([`${idea.id}.json`, `${tarea.id}.json`].sort());
    // Por columna en su orden: Ideas antes que Para hacer.
    expect((await leerTablero(repo)).map((t) => t.titulo)).toEqual(["modo oscuro", "exportar a CSV"]);
    await expect(crearTarjeta(repo, { titulo: "   " })).rejects.toThrow("título");
  });

  it("mover deja el historial y lo último que se movió queda arriba de su columna", async () => {
    const a = await crearTarjeta(repo, { titulo: "a" }, new Date("2026-10-28T10:00:00Z"));
    const b = await crearTarjeta(repo, { titulo: "b" }, new Date("2026-10-28T10:01:00Z"));
    await moverTarjeta(repo, a.id, "haciendo", new Date("2026-10-28T10:02:00Z"));
    const movida = await moverTarjeta(repo, a.id, "para-hacer", new Date("2026-10-28T10:03:00Z"));
    expect(movida.historial.map((h) => h.columna)).toEqual(["para-hacer", "haciendo", "para-hacer"]);
    expect((await leerTablero(repo)).map((t) => t.titulo)).toEqual(["a", "b"]);
    // Mover a la misma columna no ensucia el historial.
    expect((await moverTarjeta(repo, b.id, "para-hacer")).historial).toHaveLength(1);
  });

  it("dos comentarios a la vez no se pisan", async () => {
    const t = await crearTarjeta(repo, { titulo: "x" });
    await Promise.all([comentarTarjeta(repo, t.id, "uno"), comentarTarjeta(repo, t.id, "dos", "Ana")]);
    const final = await buscarTarjeta(repo, t.id);
    expect(final.comentarios.map((c) => c.texto).sort()).toEqual(["dos", "uno"]);
    await expect(comentarTarjeta(repo, t.id, "  ")).rejects.toThrow("vacío");
  });

  it("se busca por el principio del id, y dice si no alcanza", async () => {
    const t = await crearTarjeta(repo, { titulo: "x" });
    expect((await buscarTarjeta(repo, t.id.slice(0, 12))).id).toBe(t.id);
    await expect(buscarTarjeta(repo, "zzz")).rejects.toThrow("no hay");
    await crearTarjeta(repo, { titulo: "y" });
    await expect(buscarTarjeta(repo, "t")).rejects.toThrow("principio de 2");
  });

  it("una tarjeta rota no tumba el tablero", async () => {
    await crearTarjeta(repo, { titulo: "sana" });
    await writeFile(join(carpetaDelTablero(repo), "trota.json"), "{ esto no es json");
    await writeFile(join(carpetaDelTablero(repo), "tsincolumna.json"), JSON.stringify({ id: "tsincolumna", titulo: "x", columna: "otra" }));
    expect((await leerTablero(repo)).map((t) => t.titulo)).toEqual(["sana"]);
  });

  it("entiende la columna como se escribe a mano", () => {
    expect(columnaDe("Para revisar")).toBe("para-revisar");
    expect(columnaDe("hacer")).toBe("para-hacer");
    expect(columnaDe("revisión")).toBe("para-revisar");
    expect(columnaDe("HECHO")).toBe("hecho");
    expect(columnaDe("cualquiera")).toBeUndefined();
  });
});

describe("dolphin tarea", () => {
  const correr = promisify(execFile);
  const tarea = (...args: string[]) => correr(process.execPath, ["--import", "tsx", join(import.meta.dirname, "..", "src", "dolphin.ts"), "tarea", ...args, "--repo", repo], { windowsHide: true });

  it("anota, mueve y muestra el tablero", async () => {
    expect((await tarea()).stdout).toContain("El tablero está vacío");
    const { stdout } = await tarea("nueva", "exportar a CSV", "--terminado", "baja el archivo");
    const id = /(t\w{11})/.exec(stdout)![1]!;
    expect(stdout).toContain("Para hacer");
    expect((await tarea("mover", id, "revisar")).stdout).toContain("Para revisar");
    const lista = (await tarea()).stdout;
    expect(lista).toMatch(/Para revisar · 1\s+t\w+\s+exportar a CSV/);
    expect((await tarea("ver", id)).stdout).toContain("Terminada cuando: baja el archivo");
    await expect(tarea("mover", id, "a-ningun-lado")).rejects.toMatchObject({ stderr: expect.stringContaining("¿A qué columna?") });
  }, 60_000);
});
