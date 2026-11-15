import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { editarPlan, lineasDelPlan } from "../src/equipo/editar-plan.js";
import { limpiarTareas, type TareaDelPlan } from "../src/nucleo/plan.js";
import { Sesion } from "../src/tui/sesion.js";

/** El plan del líder se corrige antes del «dale»: sacar, sumar y cambiar tareas escribiendo como a una persona. */

const plan = (): TareaDelPlan[] =>
  limpiarTareas([
    { id: "t1", titulo: "la lógica", tarea: "la lógica del CSV", presupuesto: 0.6 },
    { id: "t2", titulo: "la pantalla", tarea: "el botón de exportar", presupuesto: 0.4 },
    { id: "t3", titulo: "los tests", tarea: "tests del CSV", presupuesto: 0.2, dependeDe: "t1" },
  ]);

describe("corregir el plan", () => {
  it("«sacá» saca la tarea y la que la esperaba pasa a esperar lo que esperaba ella", () => {
    const sacada = editarPlan(plan(), "sacá 1");
    expect(sacada).toMatchObject({ hecho: "Saqué la 1: la lógica." });
    const tareas = (sacada as { tareas: TareaDelPlan[] }).tareas;
    expect(tareas.map((t) => t.id)).toEqual(["t2", "t3"]);
    expect(tareas[1]!.dependeDe).toBeUndefined();
    expect(editarPlan(plan(), "quitar la tarea 9")).toEqual({ porQue: "no hay tarea 9: el plan tiene 3" });
    expect(editarPlan(plan().slice(0, 1), "sacá 1")).toMatchObject({ porQue: expect.stringContaining("única tarea") });
  });

  it("«sumá» agrega una al final, con id nuevo y limpiada como las del líder", () => {
    const sumada = editarPlan(plan(), "sumá: documentar el formato del CSV en el README");
    const tareas = (sumada as { tareas: TareaDelPlan[] }).tareas;
    expect(tareas).toHaveLength(4);
    expect(tareas[3]).toMatchObject({ id: "t4", tarea: "documentar el formato del CSV en el README", escalon: "medio" });
    expect(tareas[2]!.dependeDe).toBe("t1");
  });

  it("«cambiá» reescribe el pedido y conserva lo que esperaba", () => {
    const cambiada = editarPlan(plan(), "cambiá 3: tests de punta a punta del CSV con 10.000 filas");
    const tareas = (cambiada as { tareas: TareaDelPlan[] }).tareas;
    expect(tareas[2]).toMatchObject({ id: "t3", tarea: "tests de punta a punta del CSV con 10.000 filas", dependeDe: "t1" });
    expect(tareas[2]!.titulo).not.toBe("los tests");
  });

  it("lo que no es una corrección no se toca", () => {
    expect(editarPlan(plan(), "dale")).toBeNull();
    expect(editarPlan(plan(), "no")).toBeNull();
    expect(editarPlan(plan(), "¿cuánto sale?")).toBeNull();
  });

  it("se muestra numerado, con lo que espera cada una y el tope", () => {
    expect(lineasDelPlan(plan(), true)).toEqual([
      "1. la lógica · hasta US$ 0.60",
      "2. la pantalla · hasta US$ 0.40",
      "3. los tests · hasta US$ 0.20 (después de la 1)",
      "Tope del plan: US$ 1.20.",
    ]);
    expect(lineasDelPlan(plan(), false)).toHaveLength(3);
  });
});

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-editar-plan-"));
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

describe("el plan corregido en la sesión", () => {
  it("se corrige mientras espera y el «dale» arranca el corregido", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false, verificar: ["sintaxis"] });
    const trabajo = sesion.recibir("/equipo exportar a CSV");
    await esperar(() => sesion.mensajes.some((m) => m.texto.includes("¿Arranco?")));
    expect(sesion.mensajes.at(-1)!.texto).toContain("«sacá 2»");
    const antes = sesion.equipo!.tareas.length;

    await sesion.recibir("sacá 2");
    expect(sesion.mensajes.at(-1)!.texto).toMatch(/^Saqué la 2: .+ Queda así:\n1\. /);
    await sesion.recibir("sumá documentar el formato del CSV");
    expect(sesion.mensajes.at(-1)!.texto).toContain(`Sumé la ${antes}: documentar el formato del CSV.`);
    await sesion.recibir("cambiá 9: algo");
    expect(sesion.mensajes.at(-1)!.texto).toBe(`No lo cambié: no hay tarea 9: el plan tiene ${antes}.`);
    // Mientras se corrige no corrió nada.
    expect(sesion.equipo?.tareas.every((t) => t.estado === "esperando")).toBe(true);

    await sesion.recibir("dale");
    await trabajo;
    expect(sesion.mensajes.some((m) => m.texto === "Arranca el equipo con el plan corregido. Lo ves en la pestaña Equipo (3).")).toBe(true);
    const titulos = sesion.equipo!.tareas.map((t) => t.titulo);
    expect(titulos).toHaveLength(antes);
    expect(titulos.at(-1)).toBe("documentar el formato del CSV");
    expect(sesion.equipo?.fin?.rama).toMatch(/^dolphin-equipo\//);
  }, 120_000);
});
