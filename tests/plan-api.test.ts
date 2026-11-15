import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearServidor } from "../src/servidor.js";
import { leerCola } from "../src/nucleo/cola.js";
import type { Plan, Planificador } from "../src/nucleo/plan.js";

/**
 * Thinking desde la consola: pensar un plan no gasta en escribir y queda
 * guardado; aprobarlo valida de nuevo lo que llega del navegador, encola
 * cada tarea con su modelo, su tope y su dependencia, y arranca la cola.
 */

const correr = promisify(execFile);

describe("los planes por la consola", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let url = "";
  const corridas: { repo: string; agente: string }[] = [];
  const pedidosAlPlanificador: string[] = [];

  const planificador: Planificador = async (prompt) => {
    pedidosAlPlanificador.push(prompt);
    return {
      gastado: 0.03,
      texto: JSON.stringify({
        resumen: "el cálculo primero, la pantalla después",
        tareas: [
          { id: "t1", titulo: "Cupón en el total", tarea: "Aplicá el cupón en total() con su test", escalon: "medio", presupuesto: 0.6, dependeDe: null },
          { id: "t2", titulo: "Campo del cupón", tarea: "Sumá el campo del cupón en la pantalla del carrito", escalon: "barato", presupuesto: 0.2, dependeDe: "t1" },
          { id: "t3", titulo: "Ayuda", tarea: "Contá en el README cómo se usan los cupones", escalon: "barato", presupuesto: 0.1, dependeDe: null },
        ],
      }),
    };
  };

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-plan-api-"));
    await writeFile(join(repo, "leeme.md"), "hola\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    corridas.length = 0;
    pedidosAlPlanificador.length = 0;
    servidor = crearServidor({
      repo,
      calendario: false,
      planificar: planificador,
      correrPlan: (r, p) => corridas.push({ repo: r, agente: p.agente }),
    });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    url = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(repo);
  });

  const pase = async () => /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${url}/`)).text())?.[1];
  const mandar = (ruta: string, cuerpo: unknown, token?: string) =>
    fetch(`${url}${ruta}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-dolphin-token": token } : {}) },
      body: JSON.stringify(cuerpo),
    });

  it("sin el pase de la consola no se piensa ni se aprueba nada", async () => {
    expect((await mandar("/api/plan", { objetivo: "cupones" })).status).toBe(403);
    expect((await mandar("/api/plan/aprobar", { plan: { id: "p1", tareas: [] } })).status).toBe(403);
    expect(pedidosAlPlanificador).toHaveLength(0);
  });

  it("pensar devuelve el plan con su costo máximo, lo guarda, y sin objetivo no le pregunta a nadie", async () => {
    const token = await pase();
    if (!token) return;
    expect((await mandar("/api/plan", { objetivo: "   " }, token)).status).toBe(400);
    expect(pedidosAlPlanificador).toHaveLength(0);

    const r = await mandar("/api/plan", { objetivo: "Que la tienda acepte cupones" }, token);
    expect(r.status).toBe(200);
    const { plan, costoMaximo } = (await r.json()) as { plan: Plan; costoMaximo: number };
    expect(plan.tareas.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(plan.costoDelPlan).toBe(0.03);
    expect(costoMaximo).toBe(0.9);
    expect(pedidosAlPlanificador[0]).toContain("«Que la tienda acepte cupones»");

    const { planes } = (await (await fetch(`${url}/api/planes`)).json()) as { planes: Plan[] };
    expect(planes.map((p) => p.id)).toEqual([plan.id]);
  });

  it("aprobar valida lo editado, encola con modelo, tope y dependencia, y arranca la cola", async () => {
    const token = await pase();
    if (!token) return;
    const { plan } = (await (await mandar("/api/plan", { objetivo: "cupones" }, token)).json()) as { plan: Plan };
    // En la consola se sacó la del README, se subió el tope de la primera y se coló basura.
    const editado = {
      ...plan,
      tareas: [{ ...plan.tareas[0]!, presupuesto: 99 }, plan.tareas[1]!, { tarea: "   " }],
    };

    const r = await mandar("/api/plan/aprobar", { plan: editado, agente: "claude" }, token);
    expect(r.status).toBe(202);
    expect(corridas).toEqual([{ repo, agente: "claude" }]);

    const { tareas } = await leerCola(repo);
    expect(tareas.map((t) => [t.titulo, t.modelo, t.presupuesto, t.plan])).toEqual([
      ["Cupón en el total", "sonnet", 5, plan.id],
      ["Campo del cupón", "haiku", 0.2, plan.id],
    ]);
    expect(tareas[1]!.dependeDe).toBe(tareas[0]!.id);
    expect(tareas.every((t) => t.estado === "esperando")).toBe(true);

    const { planes } = (await (await fetch(`${url}/api/planes`)).json()) as { planes: Plan[] };
    expect(planes[0]!.aprobado).toBeTruthy();
    expect(planes[0]!.tareas).toHaveLength(2);
  });

  it("un plan sin tareas o sin id no se encola", async () => {
    const token = await pase();
    if (!token) return;
    expect((await mandar("/api/plan/aprobar", { plan: { id: "p1", tareas: [{ tarea: "" }] } }, token)).status).toBe(400);
    expect((await mandar("/api/plan/aprobar", { plan: { id: "../x", tareas: [{ tarea: "hacé algo" }] } }, token)).status).toBe(400);
    expect(corridas).toHaveLength(0);
    expect((await leerCola(repo)).tareas).toHaveLength(0);
  });
});
