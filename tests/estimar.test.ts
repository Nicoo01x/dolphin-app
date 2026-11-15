import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import type { Registro } from "../src/nucleo/desempeno.js";
import { decirEstimacion, estimarPlan, pasaDelTope } from "../src/nucleo/estimar.js";
import { Sesion } from "../src/tui/sesion.js";

/**
 * Cuánto cuesta antes de arrancar: la estimación sale de lo que costó de verdad cada rama en este
 * repo, el plan espera el «dale» (con permisos) y el tope del proyecto corta el peor caso.
 */

const registro = (tipo: Registro["tipo"], modelo: string, costo: number, extra: Partial<Registro> = {}): Registro =>
  ({ cuando: "2026-10-20T10:00:00Z", tipo, tarea: "x", modelo, paso: true, vueltas: 1, costo, ...extra }) as Registro;

describe("la estimación", () => {
  const tareas = [
    { id: "t1", titulo: "la lógica", tipo: "funcion" as const, modelo: "sonnet", presupuesto: 2 },
    { id: "t2", titulo: "los tests", tipo: "tests" as const, modelo: "haiku", presupuesto: 0.5 },
    { id: "t3", titulo: "la pantalla", tipo: "pantalla" as const, modelo: "haiku", presupuesto: 1 },
  ];

  it("usa la mediana del mismo modelo en el mismo tipo; si no hay, la del tipo; si no, el tope (y lo dice)", () => {
    const registros = [
      registro("funcion", "sonnet", 0.3),
      registro("funcion", "sonnet", 0.5),
      registro("funcion", "sonnet", 0.9),
      registro("funcion", "opus", 3),
      registro("tests", "sonnet", 0.2),
      registro("tests", "sonnet", 0.4),
      registro("pantalla", "haiku", 7, { costoDesconocido: true }),
    ];
    const e = estimarPlan(tareas, registros, 0.1);
    expect(e.tareas[0]).toMatchObject({ estimado: 0.5, maximo: 2, fuente: "3 ramas de sonnet en funcion" });
    expect(e.tareas[1]).toMatchObject({ estimado: 0.3, fuente: "2 ramas de tests" });
    // Un costo desconocido no cuenta: es un piso, no una cifra.
    expect(e.tareas[2]).toMatchObject({ estimado: 1, fuente: "sin historial: es el tope que le puso el líder" });
    expect(e.estimado).toBe(1.9);
    expect(e.maximo).toBe(3.6);
    expect(e.conHistorial).toBe(2);
    expect(decirEstimacion(e, false)).toContain("Estimado US$ 1.90 (tope US$ 3.60)");
    expect(decirEstimacion(e, true)).not.toContain("US$");
    expect(pasaDelTope(e, 3)).toBe(true);
    expect(pasaDelTope(e, 5)).toBe(false);
    expect(pasaDelTope(e, undefined)).toBe(false);
  });

  it("la mediana nunca pasa del tope de la tarea", () => {
    const e = estimarPlan([tareas[1]!], [registro("tests", "haiku", 4)]);
    expect(e.tareas[0]?.estimado).toBe(0.5);
  });
});

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-estimar-"));
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

// El sondeo lo hace `ayuda/esperar.ts`; el expect queda acá para que, si no pasó, lo diga en vez
// de seguir y romper tres líneas más abajo con un «undefined».
const esperar = async (cumple: () => boolean, tope = 20_000) => {
  await esperarA(cumple, { tope });
  expect(cumple(), "no pasó a tiempo").toBe(true);
};

describe("el plan espera el «dale»", () => {
  it("con permisos, muestra el plan con su costo, espera, y con «dale» arranca", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false, verificar: ["sintaxis"] });
    const trabajo = sesion.recibir("/equipo exportar a CSV");
    await esperar(() => sesion.mensajes.some((m) => m.texto.includes("¿Arranco?")));
    const plan = sesion.mensajes.find((m) => m.texto.includes("¿Arranco?"))!.texto;
    expect(plan).toContain("1. la lógica");
    expect(plan).toContain("Estimado US$");
    expect(plan).toContain("Todavía no hay historial");
    // Mientras espera no corrió nada: ningún compañero tomó una tarea.
    expect(sesion.equipo?.tareas.every((t) => t.estado === "esperando")).toBe(true);
    await sesion.recibir("dale");
    await trabajo;
    expect(sesion.equipo?.fin?.rama).toMatch(/^dolphin-equipo\//);
  }, 120_000);

  it("«no» lo deja sin gastar en compañeros", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false, verificar: ["sintaxis"] });
    const trabajo = sesion.recibir("/equipo exportar a CSV");
    await esperar(() => sesion.mensajes.some((m) => m.texto.includes("¿Arranco?")));
    await sesion.recibir("no");
    await trabajo;
    expect(sesion.equipo?.fin?.porQue).toBe("no se aprobó el plan");
    expect(sesion.equipo?.tareas.some((t) => t.estado !== "esperando")).toBe(false);
  }, 60_000);

  it("si el peor caso pasa el tope del proyecto, no arranca (aunque corra sin permisos)", async () => {
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ terminal: { tope: 0.01 } }));
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] });
    await sesion.recibir("/equipo exportar a CSV");
    expect(sesion.mensajes.some((m) => m.texto.includes("se pasa del tope de este proyecto"))).toBe(true);
    expect(sesion.equipo?.fin?.porQue).toBe("el plan se pasa del tope del proyecto");
  }, 60_000);
});
