import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearBot } from "../src/bots/almacen.js";
import { entornoDelBot } from "../src/bots/entorno.js";
import { pensar } from "../src/bots/pensar.js";
import { confirmarPresupuesto, leerGasto, leerPendienteDePresupuesto, registrarCorrida } from "../src/bots/presupuesto.js";

describe("presupuesto y entorno de bots", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await borrarCarpeta(dir);
    delete process.env.DOLPHIN_BOTS_DIR;
  });
  it("no deja llegar GITHUB_TOKEN al motor y permite solo una variable declarada", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-entorno-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Entorno", motor: "codex", entorno: ["MI_VARIABLE"] });
    const entorno = entornoDelBot(bot, { PATH: "p", GITHUB_TOKEN: "no", MI_VARIABLE: "sí", OTRO_SECRET: "no" });
    expect(entorno).toEqual({ PATH: "p", MI_VARIABLE: "sí" });
  });
  it("corta por corridas y escribe gasto mensual sin volver a llamar al motor", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-presupuesto-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Limitado", presupuesto: { corridasPorMes: 1 } });
    let llamadas = 0;
    await pensar(bot, "uno", { correr: async () => { llamadas++; return "respuesta"; } });
    const segunda = await pensar(bot, "dos", { correr: async () => { llamadas++; return "no debería"; } });
    expect(llamadas).toBe(1);
    expect(segunda.texto).toContain("No corro más este mes");
    expect(JSON.parse(await readFile(join(dir, bot.id, "gasto.json"), "utf8"))).toMatchObject({ corridasPorMes: 1 });
  });

  it("pausa al cruzar el aviso y continúa sólo después de «seguí»", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-aviso-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Aviso", presupuesto: { avisoUsd: 1, usdPorMes: 5 } });
    await registrarCorrida(bot, 1);
    let llamadas = 0;
    const pausado = await pensar(bot, "segunda", { correr: async () => (llamadas++, "no debería") });
    expect(pausado.texto).toContain("seguí");
    expect(llamadas).toBe(0);
    expect(await leerPendienteDePresupuesto(bot)).toMatchObject({ mensaje: "segunda" });
    await confirmarPresupuesto(bot);
    await pensar(bot, "segunda", { correr: async () => (llamadas++, "continuó") });
    expect(llamadas).toBe(1);
  });

  it("un pedido pausado de otro mes se descarta y no se acepta el aviso del mes nuevo", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-aviso-viejo-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Viejo", presupuesto: { avisoUsd: 1 } });
    const septiembre = new Date("2026-09-30T12:00:00Z");
    const octubre = new Date("2026-10-01T12:00:00Z");
    await registrarCorrida(bot, 1, septiembre);
    const pausado = await pensar(bot, "de septiembre", { ahora: () => septiembre, correr: async () => "no debería" });
    expect(pausado.pausado).toBe(true);
    expect(await leerPendienteDePresupuesto(bot, septiembre)).toMatchObject({ mensaje: "de septiembre" });
    expect(await leerPendienteDePresupuesto(bot, octubre)).toBeUndefined();
    await expect(readFile(join(dir, bot.id, "presupuesto-pendiente.json"), "utf8")).rejects.toThrow();
    expect((await leerGasto(bot.id, octubre)).avisoAceptado).toBeUndefined();
  });
});
