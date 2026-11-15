import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import type { Planificador } from "../src/nucleo/plan.js";
import { leerPlanGuardado } from "../src/nucleo/plan.js";
import { esperar } from "../src/nucleo/tarjetas-espera.js";
import { buscarTarjeta, crearTarjeta, moverTarjeta } from "../src/nucleo/tarjetas.js";
import { crearServidor } from "../src/servidor.js";

/** El «dale» desde la consola: soltar la tarjeta en Haciendo pide el plan; aprobarlo arranca el equipo. */

const lider: Planificador = async (prompt) => ({
  texto: JSON.stringify({
    resumen: prompt.includes("exportar a CSV") ? "en dos" : "otra cosa",
    tareas: [
      { id: "t1", titulo: "la lógica", tarea: "exportar: la lógica", escalon: "medio" },
      { id: "t2", titulo: "los tests", tarea: "exportar: los tests", escalon: "barato", dependeDe: "t1" },
    ],
  }),
  gastado: 0.02,
});

describe("el «dale» de una tarjeta", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";
  let token = "";
  const corridas: { tarjeta: string; plan: string; agente: string }[] = [];

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-dale-"));
    corridas.length = 0;
    servidor = crearServidor({ repo, calendario: false, planificar: lider, correrTarjeta: (_r, p) => corridas.push({ ...p }) });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
    token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1] ?? "";
  });
  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(repo);
  });

  const mandar = (ruta: string, cuerpo: unknown, pase = token) =>
    fetch(`${base}${ruta}`, { method: "POST", headers: { "content-type": "application/json", "x-dolphin-token": pase }, body: JSON.stringify(cuerpo) });

  it("el plan sale de la tarjeta, con lo que cuesta, y aprobarlo la pasa a Haciendo y arranca el equipo", async () => {
    const t = await crearTarjeta(repo, { titulo: "exportar a CSV", terminado: "baja un .csv" });
    expect((await mandar(`/api/tablero/${t.id}/plan`, {}, "")).status).toBe(403);

    const pensado = await (await mandar(`/api/tablero/${t.id}/plan`, { agente: "claude" })).json();
    expect(pensado.plan.resumen).toBe("en dos");
    expect(pensado.plan.tareas).toHaveLength(2);
    expect(pensado.estimacion.tareas).toHaveLength(2);
    expect(pensado.costoMaximo).toBeGreaterThan(0);
    // Pensar no mueve nada ni arranca a nadie.
    expect((await buscarTarjeta(repo, t.id)).columna).toBe("para-hacer");
    expect(corridas).toHaveLength(0);

    // La persona sacó una tarea antes del «dale»: corre el plan como quedó.
    const editado = { ...pensado.plan, tareas: pensado.plan.tareas.slice(0, 1) };
    const dale = await mandar(`/api/tablero/${t.id}/dale`, { plan: editado, agente: "claude" });
    expect(dale.status).toBe(202);
    expect((await dale.json()).tarjeta.columna).toBe("haciendo");
    expect(corridas).toEqual([{ tarjeta: t.id, plan: pensado.plan.id, agente: "claude" }]);
    const guardado = await leerPlanGuardado(repo, pensado.plan.id);
    expect(guardado?.tareas.map((x) => x.titulo)).toEqual(["la lógica"]);
    expect(guardado?.aprobado).toBeTruthy();
  });

  it("no arranca una tarjeta que espera a otra, ni una que ya está en Para revisar o en Hecho", async () => {
    const base1 = await crearTarjeta(repo, { titulo: "la base" });
    const arriba = await crearTarjeta(repo, { titulo: "lo de arriba" });
    await esperar(repo, arriba.id, base1.id);
    const frenada = await mandar(`/api/tablero/${arriba.id}/plan`, {});
    expect(frenada.status).toBe(409);
    expect((await frenada.json()).porQue).toContain("«la base»");

    await moverTarjeta(repo, base1.id, "para-revisar");
    expect((await mandar(`/api/tablero/${base1.id}/plan`, {})).status).toBe(409);
    await moverTarjeta(repo, base1.id, "hecho");
    expect((await mandar(`/api/tablero/${base1.id}/dale`, { plan: { id: "x", tareas: [] } })).status).toBe(409);
    // Con la base en Hecho, la de arriba ya se puede pensar.
    expect((await mandar(`/api/tablero/${arriba.id}/plan`, {})).status).toBe(200);
  });

  it("un plan roto o vacío no arranca nada", async () => {
    const t = await crearTarjeta(repo, { titulo: "algo" });
    expect((await mandar(`/api/tablero/${t.id}/dale`, { plan: { id: "../x", tareas: [] } })).status).toBe(400);
    expect((await mandar(`/api/tablero/${t.id}/dale`, { plan: { id: "p1", tareas: [] } })).status).toBe(400);
    expect(corridas).toHaveLength(0);
    expect((await buscarTarjeta(repo, t.id)).columna).toBe("para-hacer");
  });
});

describe("el «dale» en la demo", () => {
  it("piensa un líder de mentira y el equipo corre con el agente de mentira, aunque pidan Claude", async () => {
    const repo = await mkdtemp(join(tmpdir(), "dolphin-dale-demo-"));
    const corridas: { agente: string }[] = [];
    const servidor = crearServidor({ repo, calendario: false, demo: true, correrTarjeta: (_r, p) => corridas.push({ agente: p.agente }) });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    try {
      const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      const token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1] ?? "";
      const mandar = (ruta: string, cuerpo: unknown) => fetch(`${base}${ruta}`, { method: "POST", headers: { "content-type": "application/json", "x-dolphin-token": token }, body: JSON.stringify(cuerpo) });
      const t = await crearTarjeta(repo, { titulo: "el logo" });
      const { plan } = await (await mandar(`/api/tablero/${t.id}/plan`, { agente: "claude" })).json();
      expect(plan.tareas.map((x: { titulo: string }) => x.titulo)).toEqual(["la lógica", "la pantalla", "los tests"]);
      expect((await mandar(`/api/tablero/${t.id}/dale`, { plan, agente: "claude" })).status).toBe(202);
      expect(corridas).toEqual([{ agente: "mentira" }]);
    } finally {
      await new Promise((listo) => servidor.close(listo));
      await borrarCarpeta(repo);
    }
  });
});
