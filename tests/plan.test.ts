import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LIMITES,
  costoMaximo,
  guardarPlan,
  leerPlan,
  leerPlanGuardado,
  limpiarTareas,
  listarPlanes,
  planificar,
  promptDePlan,
  type Plan,
} from "../src/nucleo/plan.js";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { modeloDelEscalon, modeloDelPlanificador } from "../src/nucleo/router.js";

/**
 * Thinking: lo que contesta el modelo se lee aunque venga con texto
 * alrededor, y se limpia antes de mostrarse: nada de tareas vacías, ids
 * repetidos, presupuestos fuera de rango ni dependencias que dejarían a una
 * tarea esperando para siempre.
 */

const tarea = (extra: Record<string, unknown> = {}) => ({ tarea: "Sumale un test al carrito", ...extra });

describe("leer el plan que contestó el modelo", () => {
  it("encuentra el JSON aunque venga explicado antes y después, con llaves adentro de los textos", () => {
    const texto = [
      "Miré el repo: el carrito vive en src/carrito.ts. Te propongo esto {no es JSON}:",
      JSON.stringify({
        resumen: "Primero el cálculo, después la pantalla",
        tareas: [
          { id: "t1", titulo: "Cupón en el total", tarea: "Aplicá el cupón en `total()` {con tests}", escalon: "medio", presupuesto: 0.6, dependeDe: null, porQue: "es la lógica" },
          { id: "t2", titulo: "Campo del cupón", tarea: "Sumá el campo del cupón en el carrito", escalon: "barato", presupuesto: 0.2, dependeDe: "t1", porQue: "usa lo de t1" },
        ],
      }),
      "Cualquier cosa, avisame.",
    ].join("\n");

    const plan = leerPlan(texto, "Que la tienda acepte cupones", 0.04, new Date("2026-10-22T05:00:00Z"));
    if ("porQue" in plan) throw new Error(plan.porQue);
    expect(plan.objetivo).toBe("Que la tienda acepte cupones");
    expect(plan.resumen).toBe("Primero el cálculo, después la pantalla");
    expect(plan.costoDelPlan).toBe(0.04);
    expect(plan.creado).toBe("2026-10-22T05:00:00.000Z");
    expect(plan.tareas.map((t) => [t.id, t.escalon, t.presupuesto, t.dependeDe])).toEqual([
      ["t1", "medio", 0.6, undefined],
      ["t2", "barato", 0.2, "t1"],
    ]);
    expect(plan.tareas[1]!.tipo).toBe("funcion");
    expect(costoMaximo(plan)).toBe(0.8);
  });

  it("dice por qué cuando no hay plan que leer", () => {
    expect(leerPlan("No sé qué hacer con esto.", "algo")).toEqual({ porQue: "el planificador no contestó un plan en el formato pedido" });
    expect(leerPlan('{"tareas": [{"titulo": "sin tarea"}]}', "algo")).toEqual({ porQue: "el plan vino sin ninguna tarea que se pueda hacer" });
  });
});

describe("limpiar las tareas", () => {
  it("saca las vacías, repara ids repetidos o raros y corta en ocho", () => {
    const muchas = Array.from({ length: 12 }, (_, i) => tarea({ id: i < 3 ? "t1" : `t${i + 1}` }));
    const tareas = limpiarTareas([{ tarea: "   " }, null, "texto suelto", ...muchas, tarea({ id: "con espacios raros" })]);
    expect(tareas).toHaveLength(LIMITES.tareas);
    expect(new Set(tareas.map((t) => t.id)).size).toBe(LIMITES.tareas);
    expect(tareas[0]!.id).toBe("t1");
    expect(tareas[1]!.id).not.toBe("t1");
  });

  it("los escalones se entienden en castellano y en inglés; lo desconocido es «medio»", () => {
    const tareas = limpiarTareas([tarea({ escalon: "cheap" }), tarea({ escalon: "Caro" }), tarea({ escalon: "turbo" }), tarea()]);
    expect(tareas.map((t) => t.escalon)).toEqual(["barato", "caro", "medio", "medio"]);
  });

  it("el presupuesto queda entre 0,05 y 5 dólares; sin un número que sirva, el de su escalón", () => {
    const tareas = limpiarTareas([
      tarea({ presupuesto: 99 }),
      tarea({ presupuesto: 0.001 }),
      tarea({ presupuesto: "0,5" }),
      tarea({ presupuesto: -3, escalon: "caro" }),
      tarea({ escalon: "barato" }),
    ]);
    expect(tareas.map((t) => t.presupuesto)).toEqual([LIMITES.presupuestoMaximo, LIMITES.presupuestoMinimo, 0.5, 2, 0.2]);
  });

  it("una dependencia solo vale hacia una tarea ANTERIOR que sigue en el plan", () => {
    const tareas = limpiarTareas([
      tarea({ id: "a", dependeDe: "b" }),
      tarea({ id: "b", dependeDe: "a" }),
      tarea({ id: "c", dependeDe: "no-existe" }),
      tarea({ id: "d", dependeDe: "c" }),
    ]);
    expect(tareas.map((t) => t.dependeDe)).toEqual([undefined, "a", undefined, "c"]);
  });

  it("sin título, el título es la primera oración de la tarea; los textos largos se recortan", () => {
    const [una, larga] = limpiarTareas([
      { tarea: "Arreglá el total. Después revisá el resto." },
      { tarea: "x".repeat(LIMITES.tarea + 50), titulo: "y".repeat(200) },
    ]);
    expect(una!.titulo).toBe("Arreglá el total");
    expect(larga!.tarea).toHaveLength(LIMITES.tarea);
    expect(larga!.titulo).toHaveLength(LIMITES.titulo);
    expect(una!.tipo).toBe("arreglo");
  });
});

describe("pensar el plan", () => {
  it("le pasa al planificador el objetivo con las reglas y el repo, y se queda con lo que costó", async () => {
    const pedidos: { prompt: string; repo: string }[] = [];
    const plan = await planificar("  Que la tienda acepte cupones  ", "D:/tienda", async (prompt, repo) => {
      pedidos.push({ prompt, repo });
      return { texto: JSON.stringify({ resumen: "uno", tareas: [tarea()] }), gastado: 0.07 };
    });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]!.repo).toBe("D:/tienda");
    expect(pedidos[0]!.prompt).toBe(promptDePlan("Que la tienda acepte cupones"));
    expect(pedidos[0]!.prompt).toContain("«Que la tienda acepte cupones»");
    expect(pedidos[0]!.prompt).toContain("no cambies nada");
    if ("porQue" in plan) throw new Error(plan.porQue);
    expect(plan.costoDelPlan).toBe(0.07);
  });

  it("sin objetivo no le pregunta nada a nadie", async () => {
    let preguntas = 0;
    const plan = await planificar("   ", "D:/tienda", async () => {
      preguntas++;
      return { texto: "", gastado: 0 };
    });
    expect(plan).toEqual({ porQue: "falta el objetivo" });
    expect(preguntas).toBe(0);
  });

  it("el escalón elige el modelo de Claude; los otros motores escriben con el suyo; el planificador es el del medio", () => {
    expect(modeloDelEscalon("claude", "barato")).toBe("haiku");
    expect(modeloDelEscalon("claude", "caro")).toBe("opus");
    expect(modeloDelEscalon("codex", "caro")).toBeUndefined();
    expect(modeloDelPlanificador()).toBe("sonnet");
    expect(modeloDelPlanificador({ planificar: "opus" })).toBe("opus");
  });
});

describe("los planes guardados", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-plan-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("se guardan en .dolphin/planes y se listan del más nuevo al más viejo", async () => {
    const plan = (id: string, creado: string): Plan => ({ id, objetivo: id, creado, resumen: "", tareas: limpiarTareas([tarea()]), costoDelPlan: 0 });
    await guardarPlan(repo, plan("pviejo", "2026-10-20T10:00:00.000Z"));
    await guardarPlan(repo, plan("pnuevo", "2026-10-22T10:00:00.000Z"));
    expect((await listarPlanes(repo)).map((p) => p.id)).toEqual(["pnuevo", "pviejo"]);
    expect((await leerPlanGuardado(repo, "pviejo"))?.objetivo).toBe("pviejo");
    expect(await leerPlanGuardado(repo, "../../etc/passwd")).toBeNull();
    expect(await leerPlanGuardado(repo, "no-esta")).toBeNull();
  });
});
