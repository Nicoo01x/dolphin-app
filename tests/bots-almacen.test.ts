import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  crearBot,
  guardarHabilidad,
  leerAlma,
  leerBot,
  leerHistorial,
  leerMemoria,
  listarBots,
  listarHabilidades,
  recordarEnBot,
  anotarHistorial,
  tomarLockDeBots,
} from "../src/bots/almacen.js";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { plantilla } from "../src/bots/plantillas.js";

describe("almacén de bots", () => {
  const anteriores: string[] = [];
  afterEach(async () => {
    const dir = process.env.DOLPHIN_BOTS_DIR;
    if (dir) await borrarCarpeta(dir);
    const anterior = anteriores.pop();
    if (anterior === undefined) delete process.env.DOLPHIN_BOTS_DIR;
    else process.env.DOLPHIN_BOTS_DIR = anterior;
  });
  it("crea, lista, valida el bot roto y conserva alma, memoria, habilidades e historial", async () => {
    anteriores.push(process.env.DOLPHIN_BOTS_DIR ?? "");
    process.env.DOLPHIN_BOTS_DIR = await mkdtemp(join(tmpdir(), "dolphin-bots-"));
    const bot = await crearBot({ nombre: "Mi Vigía", alma: "mirá el repo", rutinas: [] });
    expect(bot.id).toBe("mi-vigia");
    await recordarEnBot(bot.id, "mirar los tests");
    await recordarEnBot(bot.id, "mirar los tests");
    await guardarHabilidad(bot.id, "testear", "Corre los tests", "1. Mirá el comando.");
    await anotarHistorial(bot.id, "vos", "hola");
    expect(await leerAlma(bot.id)).toBe("mirá el repo");
    expect((await leerMemoria(bot.id)).match(/mirar los tests/g)).toHaveLength(1);
    expect(await listarHabilidades(bot.id)).toEqual([{ nombre: "testear", descripcion: "Corre los tests", cuerpo: "1. Mirá el comando." }]);
    expect(await leerHistorial(bot.id)).toMatchObject([{ quien: "vos", texto: "hola" }]);
    await writeFile(join(process.env.DOLPHIN_BOTS_DIR, "roto", "bot.json"), "", "utf8").catch(async () => {
      await (await import("node:fs/promises")).mkdir(join(process.env.DOLPHIN_BOTS_DIR!, "roto"), { recursive: true });
      await writeFile(join(process.env.DOLPHIN_BOTS_DIR!, "roto", "bot.json"), "no", "utf8");
    });
    expect((await listarBots()).find((x) => x.id === "roto")).toMatchObject({ id: "roto", error: expect.any(String) });
  });
  it("expone las cuatro plantillas en castellano", () => {
    expect(plantilla("vigia")?.rutinas[0]).toMatchObject({ cuando: { tipo: "cada", minutos: 30 }, latido: true });
    expect(plantilla("investigador")?.rutinas).toHaveLength(0);
  });

  it("sluguea nombres de habilidades y rechaza descripciones con saltos", async () => {
    process.env.DOLPHIN_BOTS_DIR = await mkdtemp(join(tmpdir(), "dolphin-bots-habilidad-"));
    const b = await crearBot({ nombre: "Habilidad" });
    expect(await guardarHabilidad(b.id, "Revisar tests", "Una línea", "Pasos")).toMatchObject({ nombre: "revisar-tests" });
    await expect(guardarHabilidad(b.id, "otra", "dos\nrenglones", "Pasos")).rejects.toThrow("un solo renglón");
  });

  it("agrega historial sin perder entradas concurrentes", async () => {
    process.env.DOLPHIN_BOTS_DIR = await mkdtemp(join(tmpdir(), "dolphin-bots-historial-"));
    const b = await crearBot({ nombre: "Historial" });
    await Promise.all(Array.from({ length: 12 }, (_, i) => anotarHistorial(b.id, "sistema", `entrada ${i}`)));
    expect(await leerHistorial(b.id, 20)).toHaveLength(12);
  });

  it("impide dos procesos de bots y libera el lock", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dolphin-bots-lock-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const soltar = await tomarLockDeBots();
    expect(soltar).toBeTypeOf("function");
    expect(await tomarLockDeBots()).toBeUndefined();
    await soltar!();
    expect(await tomarLockDeBots()).toBeTypeOf("function");
  });
});
