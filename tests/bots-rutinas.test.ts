import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { borrarBot, crearBot, guardarBot, leerBot } from "../src/bots/almacen.js";
import { correrRutina, proximaCorrida, rutinasQueTocan, type Rutina } from "../src/bots/rutinas.js";

describe("rutinas de bots", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await borrarCarpeta(dir);
    delete process.env.DOLPHIN_BOTS_DIR;
  });
  it("calcula diarios y cada N", () => {
    const diario: Rutina = { id: "d", cuando: { tipo: "diario", hora: "08:00" }, tarea: "parte", proxima: "2026-10-28T08:00:00.000Z" };
    expect(proximaCorrida(diario, new Date("2026-10-28T09:00:00-03:00"))).toContain("2026-10-29");
    const cada: Rutina = { id: "c", cuando: { tipo: "cada", minutos: 30 }, tarea: "mirá", proxima: "2026-10-28T11:00:00.000Z" };
    expect(proximaCorrida(cada, new Date("2026-10-28T11:20:00.000Z"))).toBe("2026-10-28T11:30:00.000Z");
  });
  it("un latido sin nada no avisa ni deja parte, pero avanza la rutina", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-rutinas-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const b = await crearBot({
      nombre: "Vigía",
      rutinas: [{ id: "latido", cuando: { tipo: "cada", minutos: 30 }, tarea: "mirá", latido: true, proxima: "2026-10-28T10:00:00.000Z" }],
    });
    const r = await correrRutina(b, b.rutinas[0]!, {
      ahora: () => new Date("2026-10-28T10:00:00.000Z"),
      pensar: async () => ({ texto: "", recordo: [], habilidades: [], nada: true }),
    });
    expect(r.avisa).toBe(false);
    expect(await readFile(join(dir, b.id, "partes")).catch(() => "")).toBe("");
    expect((await leerBot(b.id)).rutinas[0]?.ultima).toBe("2026-10-28T10:00:00.000Z");
  });
  it("pausa una rutina hasta el reinicio del cupo sin contar un fallo", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-rutina-cupo-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const b = await crearBot({ nombre: "Pausa", rutinas: [{ id: "x", cuando: { tipo: "cada", minutos: 30 }, tarea: "x", proxima: new Date(0).toISOString() }] });
    const r = await correrRutina(b, b.rutinas[0]!, { pensar: async () => ({ texto: "sin cupo", recordo: [], habilidades: [], nada: false, cupoHasta: "2026-10-28T12:00:00.000Z" }) });
    expect(r).toMatchObject({ avisa: false });
    expect(r.fallo).toBeUndefined();
    expect((await leerBot(b.id)).rutinas[0]).toMatchObject({ proxima: "2026-10-28T12:00:00.000Z" });
  });
  it("no entrega dos veces una rutina corriendo", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-rutinas-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const b = await crearBot({
      nombre: "Parte",
      rutinas: [{ id: "x", cuando: { tipo: "cada", minutos: 1 }, tarea: "x", proxima: "2026-10-28T10:00:00.000Z" }],
    });
    let liberar!: () => void;
    const esperar = new Promise<void>((r) => (liberar = r));
    let pensando = false;
    const pensar = async () => {
      pensando = true;
      await esperar;
      return { texto: "parte", recordo: [], habilidades: [], nada: false };
    };
    const primera = correrRutina(b, b.rutinas[0]!, { pensar });
    // La rutina queda tomada cuando la corrida ya está pensando, y eso no pasa en un plazo fijo.
    await esperarA(() => pensando);
    expect(rutinasQueTocan([b], new Date("2026-10-28T10:01:00.000Z"))).toHaveLength(0);
    liberar();
    await primera;
  });
  it("una rutina que falla avanza con reintentos y avisa una sola vez por racha", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-rutinas-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const b = await crearBot({
      nombre: "Escritor",
      rutinas: [{ id: "diario", cuando: { tipo: "diario", hora: "06:00" }, tarea: "escribí", proxima: "2026-10-28T09:00:00.000Z" }],
    });
    const falla = async (): Promise<never> => {
      throw new Error("límite de uso");
    };
    const ahora = new Date("2026-10-28T09:00:00.000Z");
    const primera = await correrRutina(b, b.rutinas[0]!, { ahora: () => ahora, pensar: falla });
    expect(primera).toMatchObject({ avisa: true, fallo: true });
    const tras1 = (await leerBot(b.id)).rutinas[0]!;
    expect(tras1).toMatchObject({ fallos: 1, ultimoError: "límite de uso", proxima: "2026-10-28T09:05:00.000Z" });
    // Ya no está vencida: el reloj de 30 s no la vuelve a lanzar.
    expect(rutinasQueTocan([await leerBot(b.id)], new Date("2026-10-28T09:00:30.000Z"))).toHaveLength(0);

    const segunda = await correrRutina(await leerBot(b.id), tras1, { ahora: () => new Date("2026-10-28T09:05:00.000Z"), pensar: falla });
    expect(segunda.avisa).toBe(false);
    expect((await leerBot(b.id)).rutinas[0]).toMatchObject({ fallos: 2, proxima: "2026-10-28T09:20:00.000Z" });

    // Cuando vuelve a salir, la racha se olvida.
    const bien = await correrRutina(await leerBot(b.id), (await leerBot(b.id)).rutinas[0]!, {
      ahora: () => new Date("2026-10-28T09:20:00.000Z"),
      pensar: async () => ({ texto: "la nota", recordo: [], habilidades: [], nada: false }),
    });
    expect(bien.avisa).toBe(true);
    const final = (await leerBot(b.id)).rutinas[0]!;
    expect(final.fallos).toBeUndefined();
    expect(final.ultimoError).toBeUndefined();
  });

  it("actualiza solo la rutina vigente y no resucita un bot borrado", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-rutina-race-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const b = await crearBot({
      nombre: "Carrera",
      permiso: "libre",
      rutinas: [{ id: "larga", cuando: { tipo: "cada", minutos: 5 }, tarea: "x", proxima: new Date(0).toISOString() }],
    });
    let liberar!: () => void;
    const espera = new Promise<void>((resolve) => (liberar = resolve));
    let pensando = false;
    const corrida = correrRutina(b, b.rutinas[0]!, { pensar: async () => { pensando = true; await espera; return { texto: "ok", recordo: [], habilidades: [], nada: false }; } });
    // El cambio tiene que caer MIENTRAS la corrida piensa: se espera a que esté pensando.
    await esperarA(() => pensando);
    await guardarBot({ ...(await leerBot(b.id)), permiso: "leer" });
    liberar();
    await corrida;
    expect((await leerBot(b.id)).permiso).toBe("leer");

    let liberarB!: () => void;
    const esperaB = new Promise<void>((resolve) => (liberarB = resolve));
    let pensandoB = false;
    const corridaB = correrRutina(await leerBot(b.id), (await leerBot(b.id)).rutinas[0]!, {
      pensar: async () => { pensandoB = true; await esperaB; return { texto: "ok", recordo: [], habilidades: [], nada: false }; },
    });
    // Lo mismo para el borrado: tiene que pasar con la corrida pensando, no a los 10 ms.
    await esperarA(() => pensandoB);
    await borrarBot(b.id);
    liberarB();
    await corridaB;
    await expect(stat(join(dir, b.id, "bot.json"))).rejects.toThrow();
  });

  it("calcula una rutina diaria en la zona horaria pedida", () => {
    const rutina: Rutina = { id: "zona", cuando: { tipo: "diario", hora: "08:00", tz: "America/Argentina/Buenos_Aires" }, tarea: "parte", proxima: "" };
    expect(proximaCorrida(rutina, new Date("2026-10-28T10:00:00.000Z"))).toBe("2026-10-28T11:00:00.000Z");
  });

  it("un latido con permiso pendiente espera sin volver a avisar", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-latido-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const b = await crearBot({
      nombre: "Latido pregunta",
      permiso: "preguntar",
      rutinas: [{ id: "latido", cuando: { tipo: "cada", minutos: 30 }, tarea: "cambiá el archivo", latido: true, proxima: new Date(0).toISOString() }],
    });
    const correr = vi.fn(async () => "<<permiso>>quiero cambiar el archivo<</permiso>>");
    let momento = new Date("2026-10-28T10:00:00.000Z");
    const deps = { correr, ahora: () => momento };
    expect((await correrRutina(b, b.rutinas[0]!, deps)).avisa).toBe(true);
    // Dentro de los 120 s que dura el pedido de permiso; vencido, se rechaza y el latido puede volver a preguntar.
    momento = new Date("2026-10-28T10:01:00.000Z");
    expect((await correrRutina(await leerBot(b.id), (await leerBot(b.id)).rutinas[0]!, deps)).avisa).toBe(false);
    expect(correr).toHaveBeenCalledTimes(1);
  });
});
