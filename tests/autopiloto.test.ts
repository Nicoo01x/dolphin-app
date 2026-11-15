import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { correrBandeja } from "../src/autopiloto.js";
import { leerBandeja } from "../src/nucleo/bandeja.js";
import type { Turno } from "../src/nucleo/calendario.js";
import type { PedidoDeSiembra } from "../src/servidor.js";

/**
 * El autopiloto nocturno sin agentes: el sembrador es de mentira y anota a
 * quién le tocó, en qué orden, y la cosecha la inventa el test.
 */

let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-autopiloto-"));
  await mkdir(join(repo, ".dolphin"), { recursive: true });
});

afterEach(async () => {
  await borrarCarpeta(repo);
});

function asunto(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    tipo: "idea",
    titulo: `Idea ${id}`,
    detalle: `Hacer ${id}`,
    origen: "scout",
    firma: `f-${id}`,
    estado: "abierto",
    creado: "2026-10-20T00:00:00.000Z",
    ...extra,
  };
}

const valor = (n: number) => ({ valoracion: { valor: n, esfuerzo: 1, porQue: "x", cuando: "2026-10-20T00:00:00.000Z" } });
const noche = { paraLaNoche: "2026-10-24" };
const HORA_TEST = 60 * 60_000;

async function bandeja(asuntos: unknown[]) {
  await writeFile(join(repo, ".dolphin", "bandeja.json"), JSON.stringify({ asuntos }));
}

async function planUso(escritoEn: string, usadoPct: number, reiniciaEn: string | null) {
  await writeFile(
    join(repo, ".dolphin", "plan-uso.json"),
    JSON.stringify({ escritoEn, agentes: [{ agente: "codex", ventanas: [{ nombre: "semana", usadoPct, reiniciaEn }] }] }),
  );
}

const turno = (tope: number) =>
  ({ id: "t1", tareas: [], deLaBandeja: { tope }, agente: "codex", modelo: "gpt-reserve" }) as unknown as Turno;

function sembrador(alSembrar?: () => void) {
  const pedidos: PedidoDeSiembra[] = [];
  return {
    pedidos,
    sembrar: async (pedido: PedidoDeSiembra) => {
      pedidos.push(pedido);
      alSembrar?.();
    },
  };
}

describe("el autopiloto nocturno", () => {
  it("sin archivo de cupo corre como antes", async () => {
    await bandeja([asunto("a", noche)]);
    const s = sembrador();
    await correrBandeja(repo, turno(1), undefined, { sembrar: s.sembrar, casa: join(repo, "casa-sin-plan"), leerCosecha: async () => undefined });
    expect(s.pedidos.map((p) => p.asunto)).toEqual(["a"]);
  });

  it("un archivo viejo no frena el autopiloto", async () => {
    await bandeja([asunto("a", noche)]);
    const ahora = new Date("2026-10-24T02:00:00.000Z");
    await planUso(new Date(ahora.getTime() - 16 * 60_000).toISOString(), 95, new Date(ahora.getTime() + 30 * 60_000).toISOString());
    const s = sembrador();
    await correrBandeja(repo, turno(1), undefined, { sembrar: s.sembrar, casa: repo, ahora: () => ahora, leerCosecha: async () => undefined });
    expect(s.pedidos.map((p) => p.asunto)).toEqual(["a"]);
  });

  it("espera al reinicio y vuelve a mirar antes de sembrar", async () => {
    await bandeja([asunto("a", noche)]);
    let ahora = new Date("2026-10-24T02:00:00.000Z");
    const reinicia = new Date(ahora.getTime() + 30 * 60_000);
    await planUso(ahora.toISOString(), 95, reinicia.toISOString());
    const esperas: number[] = [];
    const s = sembrador();
    const r = await correrBandeja(repo, turno(1), undefined, {
      sembrar: s.sembrar,
      casa: repo,
      ahora: () => ahora,
      esperar: async (milisegundos) => {
        esperas.push(milisegundos);
        ahora = new Date(reinicia.getTime() + 2 * 60_000);
        await planUso(ahora.toISOString(), 40, null);
      },
      leerCosecha: async () => undefined,
    });
    expect(esperas).toEqual([32 * 60_000]);
    expect(s.pedidos.map((p) => p.asunto)).toEqual(["a"]);
    expect(r.porQue).toContain("Esperé al reinicio del cupo (95 % de la semana)");
  });

  it("si el reinicio cae después del fin del turno, termina con la nota", async () => {
    await bandeja([asunto("a", noche)]);
    const ahora = new Date("2026-10-24T02:00:00.000Z");
    await planUso(ahora.toISOString(), 93, new Date(ahora.getTime() + 2 * HORA_TEST).toISOString());
    const s = sembrador();
    const r = await correrBandeja(repo, turno(1), undefined, {
      sembrar: s.sembrar,
      casa: repo,
      ahora: () => ahora,
      finDeTurno: () => new Date(ahora.getTime() + HORA_TEST),
      esperar: async () => { throw new Error("no debería esperar"); },
      leerCosecha: async () => undefined,
    });
    expect(s.pedidos).toEqual([]);
    expect(r.porQue).toContain("Esperé al reinicio del cupo (93 % de la semana)");
  });

  it("un cupo pasado de 100 % también frena (el escritor no lo recorta)", async () => {
    await bandeja([asunto("a", noche)]);
    const ahora = new Date("2026-10-24T02:00:00.000Z");
    await planUso(ahora.toISOString(), 104, new Date(ahora.getTime() + 2 * HORA_TEST).toISOString());
    const s = sembrador();
    const r = await correrBandeja(repo, turno(1), undefined, {
      sembrar: s.sembrar,
      casa: repo,
      ahora: () => ahora,
      finDeTurno: () => new Date(ahora.getTime() + HORA_TEST),
      leerCosecha: async () => undefined,
    });
    expect(s.pedidos).toEqual([]);
    expect(r.porQue).toContain("104 % de la semana");
  });

  it("usa el umbral configurado", async () => {
    await bandeja([asunto("a", noche)]);
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ autopiloto: { topeCupoPct: 96 } }));
    const ahora = new Date("2026-10-24T02:00:00.000Z");
    await planUso(ahora.toISOString(), 95, new Date(ahora.getTime() + 30 * 60_000).toISOString());
    const s = sembrador();
    await correrBandeja(repo, turno(1), undefined, { sembrar: s.sembrar, casa: repo, ahora: () => ahora, leerCosecha: async () => undefined });
    expect(s.pedidos.map((p) => p.asunto)).toEqual(["a"]);
  });

  it("sin ideas marcadas no lanza nada", async () => {
    await bandeja([asunto("a")]);
    const s = sembrador();
    const r = await correrBandeja(repo, turno(3), undefined, { sembrar: s.sembrar });
    expect(r).toEqual({ salio: false, porQue: "no había ideas para esta noche" });
    expect(s.pedidos).toEqual([]);
  });

  it("toma solo las marcadas, la más valiosa primero y entre iguales la más vieja, hasta el tope", async () => {
    await bandeja([
      asunto("vieja", { ...noche, ...valor(3), creado: "2026-10-01T00:00:00.000Z" }),
      asunto("nueva", { ...noche, ...valor(3), creado: "2026-10-22T00:00:00.000Z" }),
      asunto("mejor", { ...noche, ...valor(5) }),
      asunto("sin-marcar", valor(5)),
      asunto("rechazada", { ...noche, ...valor(5), estado: "rechazado" }),
    ]);
    const s = sembrador();
    await correrBandeja(repo, turno(2), undefined, { sembrar: s.sembrar, leerCosecha: async () => undefined });
    expect(s.pedidos.map((p) => p.asunto)).toEqual(["mejor", "vieja"]);
    expect(s.pedidos[0]).toMatchObject({ agente: "codex", modelo: "gpt-reserve", automatico: true, n: 1, deAfuera: true });
    const quedo = Object.fromEntries((await leerBandeja(repo)).asuntos.map((a) => [a.id, a]));
    expect(quedo.mejor).toMatchObject({ estado: "implementando" });
    expect(quedo.mejor?.paraLaNoche).toBeUndefined();
    expect(quedo.nueva).toMatchObject({ estado: "abierto", paraLaNoche: "2026-10-24" });
  });

  it("cuenta las que pasaron el portón con la cosecha que dejó cada una", async () => {
    await bandeja([asunto("a", noche), asunto("b", noche)]);
    let vuelta = 0;
    const s = sembrador();
    const r = await correrBandeja(repo, turno(3), undefined, {
      sembrar: s.sembrar,
      leerCosecha: async () => {
        vuelta += 1;
        const cuando = new Date(Date.now() + 1000).toISOString();
        return (vuelta === 1 ? { cuando, ganador: "u1", parte: "p1.html" } : { cuando, porQueGano: "ninguna rama pasó" }) as never;
      },
    });
    expect(r).toEqual({ salio: true, porQue: "1 de 2 pasaron el portón", parte: "p1.html" });
  });

  it("cancelado entre una y otra, no lanza la siguiente", async () => {
    await bandeja([asunto("a", noche), asunto("b", noche)]);
    const control = new AbortController();
    const s = sembrador(() => control.abort());
    const r = await correrBandeja(repo, turno(3), control.signal, { sembrar: s.sembrar, leerCosecha: async () => undefined });
    expect(s.pedidos.map((p) => p.asunto)).toEqual(["a"]);
    expect(r.porQue).toContain("se canceló");
    expect((await leerBandeja(repo)).asuntos.find((a) => a.id === "b")).toMatchObject({ estado: "abierto", paraLaNoche: "2026-10-24" });
  });
});
