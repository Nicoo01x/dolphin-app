import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { crearBot, leerBot } from "../src/bots/almacen.js";
import { encolarDisparo, listarDisparos } from "../src/bots/disparos.js";
import { confirmarPresupuesto, registrarCorrida } from "../src/bots/presupuesto.js";
import { correrBots, type ServicioBots } from "../src/bots/servicio.js";

describe("servicio de bots", () => {
  let dir = "";
  // El servicio se apaga ANTES de borrar la carpeta, y se espera la vuelta en curso: detener()
  // corta el reloj pero no lo que ya estaba escribiendo, y en Windows borrar al mismo tiempo da
  // ENOTEMPTY. Era lo que hacía fallar esta hoja solo con la suite entera en paralelo.
  let servicio: ServicioBots | undefined;
  afterEach(async () => {
    servicio?.detener();
    await servicio?.listo();
    servicio = undefined;
    if (dir) await borrarCarpeta(dir);
    delete process.env.DOLPHIN_BOTS_DIR;
  });

  it("no solapa vueltas del reloj mientras una rutina sigue corriendo", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-servicio-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    await crearBot({
      nombre: "Reloj",
      motor: "mentira",
      rutinas: [
        { id: "lenta", cuando: { tipo: "cada", minutos: 1 }, tarea: "lenta", proxima: new Date(0).toISOString() },
        { id: "rápida", cuando: { tipo: "cada", minutos: 1 }, tarea: "rápida", proxima: new Date(0).toISOString() },
      ],
    });
    const llamadas: string[] = [];
    servicio = correrBots({
      cadaMs: 10,
      avisar: async () => {},
      pensar: async (_bot, tarea) => {
        llamadas.push(tarea);
        await new Promise((resolve) => setTimeout(resolve, tarea === "lenta" ? 100 : 10));
        return { texto: tarea, recordo: [], habilidades: [], nada: false };
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 280));
    servicio.detener();
    expect(llamadas.filter((x) => x === "lenta")).toHaveLength(1);
    expect(llamadas.filter((x) => x === "rápida")).toHaveLength(1);
    expect((await leerBot("reloj")).rutinas.every((r) => Date.parse(r.proxima) > Date.now() - 1000)).toBe(true);
  });

  it("con el presupuesto en pausa los disparos esperan en la cola y se avisa una vez", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-servicio-pausa-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Pausado", motor: "mentira", presupuesto: { avisoCorridasPorMes: 1, corridasPorMes: 5 } });
    await registrarCorrida(bot, undefined);
    await encolarDisparo(bot, "revisá");
    const avisos: string[] = [];
    let llamadas = 0;
    servicio = correrBots({
      cadaMs: 10,
      avisar: async (_bot, texto) => void avisos.push(texto),
      pensar: async () => (llamadas++, { texto: "hecho", recordo: [], habilidades: [], nada: false }),
    });
    // El reloj del servicio late cada 10 ms, pero con la suite entera encima puede tardar: se
    // espera al aviso, que es la señal de que ya miró el disparo y lo dejó esperando.
    await esperarA(() => avisos.length > 0);
    expect(llamadas).toBe(0);
    expect((await listarDisparos(bot))[0]?.estado).toBe("pendiente");
    expect(avisos).toEqual([expect.stringContaining("Tengo disparos esperando")]);
    await confirmarPresupuesto(bot);
    await vi.waitFor(async () => expect((await listarDisparos(bot))[0]?.estado).toBe("hecho"));
    servicio.detener();
    expect(llamadas).toBe(1);
  });

  it("un disparo que el presupuesto cortó en el medio vuelve a la cola en vez de quedar hecho", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-servicio-cortado-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Cortado", motor: "mentira" });
    await encolarDisparo(bot, "revisá");
    let llamadas = 0;
    servicio = correrBots({
      cadaMs: 10,
      avisar: async () => {},
      pensar: async () => (++llamadas === 1 ? { texto: "Pausé la corrida", recordo: [], habilidades: [], nada: false, pausado: true } : { texto: "hecho", recordo: [], habilidades: [], nada: false }),
    });
    await vi.waitFor(async () => expect((await listarDisparos(bot))[0]?.estado).toBe("hecho"));
    servicio.detener();
    expect(llamadas).toBe(2);
  });
});
