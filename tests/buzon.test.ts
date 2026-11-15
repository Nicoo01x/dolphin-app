import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import {
  actualizarEstadoCompanero,
  esperarEstado,
  enviarMensaje,
  inicializarEquipo,
  leerEstadoEquipo,
  leerMensajes,
} from "../src/equipo/buzon.js";

describe("buzón y estado de compañeros", () => {
  let repo = "";
  const equipo = "equipo-prueba";
  const entornoAnterior = process.env.DOLPHIN_COMPANERO;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-buzon-"));
    await inicializarEquipo(repo, equipo, ["ux", "backend"]);
    process.env.DOLPHIN_COMPANERO = "ux";
  });

  afterEach(async () => {
    if (entornoAnterior === undefined) delete process.env.DOLPHIN_COMPANERO;
    else process.env.DOLPHIN_COMPANERO = entornoAnterior;
    await borrarCarpeta(repo);
  });

  it("envía, lee una sola vez y corta al remitente en cinco mensajes", async () => {
    expect(await enviarMensaje(repo, equipo, "ux", "@backend", "uno")).toMatchObject({ de: "ux", para: "backend", leido: false });
    expect((await leerMensajes(repo, equipo, "backend"))[0]?.texto).toBe("uno");
    expect(await leerMensajes(repo, equipo, "backend")).toEqual([]);
    for (let i = 2; i <= 5; i++) expect(await enviarMensaje(repo, equipo, "ux", "backend", `mensaje ${i}`)).not.toBeNull();
    expect(await enviarMensaje(repo, equipo, "ux", "backend", "sexto")).toBeNull();
    const buzón = await readFile(join(repo, ".dolphin", "equipos", equipo, "buzon.jsonl"), "utf8");
    expect(buzón).not.toContain("sexto");
    expect((await leerEstadoEquipo(repo, equipo)).avisos).toContain("mensajes agotados: ux llegó a 5");
  });

  it("espera el estado del otro y devuelve al que espera a trabajando", async () => {
    await actualizarEstadoCompanero(repo, equipo, "backend", "trabajando");
    const espera = esperarEstado(repo, equipo, "@backend", "libre", 1);
    setTimeout(() => void actualizarEstadoCompanero(repo, equipo, "backend", "libre"), 20);
    await expect(espera).resolves.toBe(true);
    expect((await leerEstadoEquipo(repo, equipo)).companeros.find((x) => x.nombre === "ux")?.estado).toBe("trabajando");
  });
});

