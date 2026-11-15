import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { aprenderDeLoDeshechoEnElEquipo, aprenderDelEquipo, cortesRepetidos } from "../src/equipo/aprender.js";
import { correrEquipo } from "../src/equipo/equipo.js";
import { leerMemoria } from "../src/nucleo/memoria.js";
import { leerNotas } from "../src/nucleo/notas.js";
import type { Planificador } from "../src/nucleo/plan.js";

/**
 * El equipo aprende como la siembra: varios compañeros cortados en la misma fase, o piezas que no
 * encajan, quedan como error confirmado; lo que la persona deshace va a la memoria de corto plazo.
 * Con git de verdad y el agente de mentira.
 */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();
let repo = "";

async function repoCon(codigo: string): Promise<void> {
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module", scripts: { sintaxis: "node --check src/a.js" } }));
  await writeFile(join(repo, "src", "a.js"), codigo);
  await git(["init", "-q"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-equipo-aprende-"));
});
afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

describe("qué es una lección del equipo", () => {
  it("varios cortados en la misma fase, y al menos la mitad del equipo", () => {
    const corte = (id: string, fase?: string) => ({ id, titulo: id, ...(fase ? { fase } : {}), porQue: `falló ${fase}` });
    expect(cortesRepetidos([corte("t1", "typecheck"), corte("t2", "typecheck")], 3)).toEqual([{ fase: "typecheck", cuantos: 2, ejemplo: "falló typecheck" }]);
    expect(cortesRepetidos([corte("t1", "typecheck"), corte("t2", "typecheck")], 5)).toEqual([]);
    expect(cortesRepetidos([corte("t1", "typecheck"), corte("t2", "test")], 2)).toEqual([]);
    // Lo que se cayó antes de escribir no enseña nada del repo.
    expect(cortesRepetidos([corte("t1", "el agente"), corte("t2", "el agente")], 2)).toEqual([]);
  });

  it("piezas que pasaban solas y juntas no, quedan como error confirmado", async () => {
    await repoCon("export const a = 1\n");
    const [recuerdo] = await aprenderDelEquipo(repo, { objetivo: "exportar a CSV", total: 2, cortes: [], integracion: { fase: "test", detalle: "2 tests fallan\nmás" } });
    expect(recuerdo).toMatchObject({ tipo: "error" });
    expect(recuerdo!.dicho).toBe("En el equipo de «exportar a CSV», cada parte pasó su portón pero juntas no pasaron test: 2 tests fallan. Las partes tienen que encajar entre sí, no solo andar solas.");
  });
});

describe("el equipo de punta a punta", () => {
  it("si todos los compañeros se cortan en la misma fase, la memoria lo recuerda", async () => {
    // El código base no compila: ningún agente de mentira lo arregla, así que cada compañero se corta en «sintaxis».
    await repoCon("export const suma = (a, b => a + b\n");
    const lider: Planificador = async () => ({
      texto: JSON.stringify({
        resumen: "dos partes",
        tareas: [
          { id: "t1", titulo: "la lógica", tarea: "la lógica del CSV", escalon: "barato" },
          { id: "t2", titulo: "los tests", tarea: "los tests del CSV", escalon: "barato" },
        ],
      }),
      gastado: 0,
    });
    const resultado = await correrEquipo({ repo, objetivo: "exportar a CSV", agente: "mentira", verificar: ["sintaxis"], pensar: lider, revisor: null, resolver: null }, () => {});
    expect(resultado.rama).toBeUndefined();
    const errores = (await leerMemoria(repo)).recuerdos.filter((r) => r.tipo === "error");
    expect(errores.some((r) => r.dicho.startsWith("En el equipo de «exportar a CSV», 2 de 2 compañeros se cortaron en sintaxis."))).toBe(true);
  }, 120_000);
});

describe("lo que la persona deshace", () => {
  it("queda como corrección suya, con los archivos que tocaba", async () => {
    await repoCon("export const a = 1\n");
    await git(["checkout", "-q", "-b", "companero"], repo);
    await writeFile(join(repo, "src", "csv.js"), "export const csv = () => ''\n");
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "csv"], repo);
    await git(["checkout", "-q", "-"], repo);
    await git(["merge", "--no-ff", "-q", "-m", "equipo: el CSV", "companero"], repo);
    const commit = await git(["rev-parse", "HEAD"], repo);

    await aprenderDeLoDeshechoEnElEquipo(repo, { ruta: repo, commit, titulo: "exportar el CSV con comas", objetivo: "exportar a CSV" });
    const [nota] = await leerNotas(repo);
    expect(nota).toMatchObject({ origen: "owner", tipo: "correccion" });
    expect(nota!.texto).toBe("La persona deshizo «exportar el CSV con comas» del equipo de «exportar a CSV» (tocaba src/csv.js): ese enfoque no le sirvió.");
  });
});
