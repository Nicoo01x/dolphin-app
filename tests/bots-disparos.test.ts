import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearBot } from "../src/bots/almacen.js";
import { devolverDisparo, encolarDisparo, limiteDeDisparos, listarDisparos, tomarDisparo, terminarDisparo } from "../src/bots/disparos.js";

describe("disparadores locales", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await borrarCarpeta(dir);
    delete process.env.DOLPHIN_BOTS_DIR;
  });

  it("deja un pedido durable con sus límites y lo reclama una sola vez", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-disparos-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Disparador" });
    await encolarDisparo(bot, "revisá este dato", { vueltas: 2, modelo: "haiku", herramientas: ["Read"] });
    const tomado = await tomarDisparo(bot);
    expect(tomado).toMatchObject({ estado: "corriendo", vueltas: 2, modelo: "haiku", herramientas: ["Read"] });
    expect(await tomarDisparo(bot)).toBeUndefined();
    await terminarDisparo(bot, tomado!);
    expect((await listarDisparos(bot))[0]?.estado).toBe("hecho");
  });

  it("atiende los disparos en el orden en que llegaron", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-disparos-orden-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Fifo" });
    const ahora = new Date("2026-10-28T10:00:00Z");
    for (const n of ["uno", "dos", "tres", "cuatro", "cinco"]) await encolarDisparo(bot, n, {}, ahora);
    const atendidos: string[] = [];
    for (let i = 0; i < 5; i++) {
      const disparo = await tomarDisparo(bot, ahora);
      atendidos.push(disparo!.mensaje);
      await terminarDisparo(bot, disparo!, ahora);
    }
    expect(atendidos).toEqual(["uno", "dos", "tres", "cuatro", "cinco"]);
  });

  it("el tope por hora cuenta por cuándo arrancaron, no por cuándo se encolaron", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-disparos-tope-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Tope" });
    const ayer = new Date("2026-10-27T10:00:00Z");
    const ahora = new Date("2026-10-28T10:00:00Z");
    for (let i = 0; i < limiteDeDisparos + 1; i++) await encolarDisparo(bot, `atrasado ${i}`, {}, ayer);
    for (let i = 0; i < limiteDeDisparos; i++) await terminarDisparo(bot, (await tomarDisparo(bot, ahora))!, ahora);
    expect(await tomarDisparo(bot, ahora)).toBeUndefined();
    const devuelto = await tomarDisparo(bot, new Date(ahora.getTime() + 60 * 60_000 + 1));
    expect(devuelto?.mensaje).toBe(`atrasado ${limiteDeDisparos}`);
    await devolverDisparo(bot, devuelto!);
    expect((await listarDisparos(bot)).at(-1)).toMatchObject({ estado: "pendiente" });
    expect((await listarDisparos(bot)).at(-1)).not.toHaveProperty("iniciado");
  });

  it("no roba un disparo que sigue teniendo dueño en el servicio", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-disparos-corte-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Recuperable" });
    await encolarDisparo(bot, "seguí", {}, new Date("2026-10-28T10:00:00Z"));
    const primero = await tomarDisparo(bot, new Date("2026-10-28T10:00:01Z"));
    const segundo = await tomarDisparo(bot, new Date("2026-10-28T10:00:02Z"));
    expect(segundo).toBeUndefined();
    expect(primero?.estado).toBe("corriendo");
  });
});
