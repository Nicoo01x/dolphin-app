import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { anotarHistorial, crearBot, leerBot } from "../src/bots/almacen.js";
import { pensar } from "../src/bots/pensar.js";
import { cambiarMotor } from "../src/bots/motor.js";

describe("cambio manual de motor de bots", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await borrarCarpeta(dir);
    delete process.env.DOLPHIN_BOTS_DIR;
  });

  it("persiste el motor nuevo y un paquete de traspaso sin secretos", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-motor-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Cambio", motor: "claude" });
    await anotarHistorial(bot.id, "vos", "seguí con API_TOKEN=secreto");
    const cambio = await cambiarMotor(bot, "codex");
    expect(cambio.cambio).toBe(true);
    expect((await leerBot(bot.id)).motor).toBe("codex");
    const paquete = await readFile(join(dir, bot.id, "traspaso.md"), "utf8");
    expect(paquete).toContain("Traspaso de motor");
    expect(paquete).not.toContain("secreto");
  });

  it("limpia el modelo del motor viejo y un respaldo que quedó igual al motor nuevo", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-motor-modelo-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Modelo", motor: "claude", modelo: "sonnet", respaldo: "codex" });
    await cambiarMotor(bot, "codex");
    const cambiado = await leerBot(bot.id);
    expect(cambiado).toMatchObject({ motor: "codex" });
    expect(cambiado.modelo).toBeUndefined();
    expect(cambiado.respaldo).toBeUndefined();
    const otro = await crearBot({ nombre: "Respaldo", motor: "codex", respaldo: "claude" });
    await cambiarMotor({ ...otro, respaldo: "codex" }, "claude");
    expect((await leerBot(otro.id)).respaldo).toBe("codex");
  });

  it("el traspaso va en el prompt hasta la primera corrida que anda, y después se borra", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-motor-traspaso-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Traspaso", motor: "claude", permiso: "leer" });
    const { bot: cambiado } = await cambiarMotor(bot, "codex");
    const prompts: string[] = [];
    let falla = true;
    const correr = async ({ prompt }: { prompt: string }) => {
      prompts.push(prompt);
      if (falla) throw new Error("se cayó el motor");
      return "ok";
    };
    await expect(pensar(cambiado, "hola", { correr })).rejects.toThrow("se cayó");
    falla = false;
    await pensar(cambiado, "hola", { correr });
    await pensar(cambiado, "hola", { correr });
    expect(prompts.map((p) => p.includes("PAQUETE DE TRASPASO"))).toEqual([true, true, false]);
    await expect(readFile(join(dir, bot.id, "traspaso.md"), "utf8")).rejects.toThrow();
  });});
