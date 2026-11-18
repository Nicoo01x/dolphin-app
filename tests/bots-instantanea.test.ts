import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { anotarHistorial, crearBot, leerBot, listarBots } from "../src/bots/almacen.js";
import { instantaneaDeManada, proximaRutina } from "../src/bots/instantanea.js";
import { apartarBot, carpetaDeApartados, importarBot } from "../src/bots/mudanza.js";
import { registrarCorrida } from "../src/bots/presupuesto.js";
import { instalarServicio, textoUnidad } from "../src/bots/servicio-instalador.js";

const execFile = promisify(execFileCallback);
const existe = (ruta: string) =>
  stat(ruta).then(
    () => true,
    () => false,
  );

describe("lo que la app lee de los bots", () => {
  const carpetas: string[] = [];
  afterEach(async () => {
    delete process.env.DOLPHIN_BOTS_DIR;
    for (const c of carpetas.splice(0)) await borrarCarpeta(c);
  });
  async function nuevaCarpeta(prefijo: string): Promise<string> {
    const c = await mkdtemp(join(tmpdir(), prefijo));
    carpetas.push(c);
    return c;
  }

  it("la instantánea trae la próxima rutina, el gasto contra el tope, el último aviso y nada secreto", async () => {
    const raiz = await nuevaCarpeta("dolphin-instantanea-");
    process.env.DOLPHIN_BOTS_DIR = join(raiz, "bots");
    const bot = await crearBot({
      nombre: "Vigía",
      motor: "mentira",
      presupuesto: { usdPorMes: 5, corridasPorMes: 40 },
      telegram: { token: "123:secreto", chat: "9" },
      rutinas: [
        { id: "tarde", cuando: { tipo: "diario", hora: "18:00" }, tarea: "la de la tarde", proxima: "2026-11-18T21:00:00.000Z" },
        { id: "pronto", cuando: { tipo: "cada", minutos: 30 }, tarea: "mirá el repo", latido: true, proxima: "2026-11-18T12:30:00.000Z" },
      ],
    });
    await registrarCorrida(bot, 1.25);
    await anotarHistorial(bot.id, "rutina", "revisá");
    await anotarHistorial(bot.id, "bot", "Se rompieron 2 tests\n  de la tienda.");
    await anotarHistorial(bot.id, "vos", "gracias");
    await crearBot({ nombre: "Parte", motor: "mentira" });

    const manada = await instantaneaDeManada();
    expect(manada.carpeta).toBe(join(raiz, "bots"));
    expect(manada.servicio.vivo).toBe(false);
    const vigia = manada.bots.find((b) => b.id === "vigia")!;
    expect(vigia).toMatchObject({
      corriendo: false,
      proxima: { tarea: "mirá el repo", latido: true },
      gasto: { usd: 1.25, corridas: 1 },
      tope: { usd: 5, corridas: 40 },
      ultimo: { texto: "Se rompieron 2 tests de la tienda." },
      telegram: true,
      dir: join(raiz, "bots", "vigia"),
    });
    expect(JSON.stringify(manada)).not.toContain("secreto");
    expect(manada.bots.find((b) => b.id === "parte")).not.toHaveProperty("tope");
  });

  it("la próxima rutina ignora las de evento, que no tienen hora", () => {
    expect(proximaRutina({ rutinas: [{ id: "e", cuando: { tipo: "evento" }, tarea: "push", proxima: "", secreto: "x".repeat(32) }] })).toBeUndefined();
  });

  it("llevar un bot: se copia entero, cambia la carpeta de trabajo y no se lleva lo que esperaba un «dale»", async () => {
    const origen = await nuevaCarpeta("dolphin-mudanza-origen-");
    process.env.DOLPHIN_BOTS_DIR = join(origen, "bots");
    const bot = await crearBot({ nombre: "Escritor", motor: "mentira", carpeta: "D:/notas" });
    await anotarHistorial(bot.id, "bot", "escribí la pieza");
    await writeFile(join(origen, "bots", bot.id, "pendiente.json"), "{}", "utf8");

    const destino = await nuevaCarpeta("dolphin-mudanza-destino-");
    process.env.DOLPHIN_BOTS_DIR = join(destino, "bots");
    const trabajo = join(destino, "trabajo", "escritor");
    const llegado = await importarBot({ origen: join(origen, "bots", bot.id), carpeta: trabajo });
    expect(llegado.carpeta).toBe(trabajo);
    expect(await existe(trabajo)).toBe(true);
    expect(await existe(join(destino, "bots", "escritor", "pendiente.json"))).toBe(false);
    expect(await readFile(join(destino, "bots", "escritor", "historial.jsonl"), "utf8")).toContain("escribí la pieza");
    await expect(importarBot({ origen: join(origen, "bots", bot.id), carpeta: trabajo })).rejects.toThrow("ya hay un bot");
    expect((await importarBot({ origen: join(origen, "bots", bot.id), carpeta: trabajo, reemplazar: true })).id).toBe("escritor");
  });

  it("un bot.json roto no queda instalado a medias", async () => {
    const origen = await nuevaCarpeta("dolphin-mudanza-roto-");
    await writeFile(join(origen, "bot.json"), JSON.stringify({ id: "roto", nombre: "roto", motor: "otro" }), "utf8");
    process.env.DOLPHIN_BOTS_DIR = join(origen, "bots");
    await expect(importarBot({ origen, carpeta: join(origen, "t") })).rejects.toThrow();
    expect(await existe(join(origen, "bots", "roto"))).toBe(false);
  });

  it("apartar saca el bot de la manada de acá sin borrarlo", async () => {
    const raiz = await nuevaCarpeta("dolphin-apartar-");
    process.env.DOLPHIN_BOTS_DIR = join(raiz, "bots");
    await crearBot({ nombre: "Parte", motor: "mentira" });
    const guardado = await apartarBot("parte");
    expect(guardado).toBe(join(carpetaDeApartados(), "parte"));
    expect(await listarBots()).toEqual([]);
    expect(await existe(join(guardado, "bot.json"))).toBe(true);
    await crearBot({ nombre: "Parte", motor: "mentira" });
    expect(await apartarBot("parte")).not.toBe(guardado);
    await expect(apartarBot("parte")).rejects.toThrow("no hay un bot");
    await expect(leerBot("parte")).rejects.toThrow();
  });

  it("el servicio de systemd se lleva el comando entero y el PATH, y reinicia sólo si la unidad cambió", async () => {
    const home = await nuevaCarpeta("dolphin-unidad-");
    expect(textoUnidad("linux", "/n/node /d/bin/dolphin.mjs bots correr", { PATH: '/a b/bin:/c%d"' })).toContain('Environment="PATH=/a b/bin:/c%%d\\""');
    const corridas: string[] = [];
    const ejecutar = async (cmd: string, args: readonly string[]) => {
      corridas.push([cmd, ...args].join(" "));
    };
    const comando = "/n/node /d/bin/dolphin.mjs bots correr";
    const unidad = await instalarServicio({ plataforma: "linux", home, comando, entorno: { PATH: "/usr/bin" }, ejecutar });
    expect(unidad).toContain(`ExecStart=${comando}`);
    expect(corridas).toEqual(["systemctl --user enable --now dolphin-bots.service"]);
    await instalarServicio({ plataforma: "linux", home, comando, entorno: { PATH: "/usr/bin" }, ejecutar });
    expect(corridas).toHaveLength(2);
    await instalarServicio({ plataforma: "linux", home, comando, entorno: { PATH: "/usr/local/bin:/usr/bin" }, ejecutar });
    expect(corridas.slice(-2)).toEqual(["systemctl --user daemon-reload", "systemctl --user restart dolphin-bots.service"]);
  });

  it("`dolphin bots --json` imprime la manada como un solo JSON", async () => {
    const raiz = await nuevaCarpeta("dolphin-cli-json-");
    const env = { ...process.env, DOLPHIN_BOTS_DIR: join(raiz, "bots") };
    const tsx = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    const cli = join(process.cwd(), "src", "dolphin.ts");
    const nuevo = await execFile(process.execPath, [tsx, cli, "bots", "nuevo", "Vigía", "--plantilla", "vigia", "--demo", "--json"], { env });
    expect(JSON.parse(nuevo.stdout)).toMatchObject({ id: "vigia", motor: "mentira", permiso: "leer", proxima: { latido: true } });
    const lista = await execFile(process.execPath, [tsx, cli, "bots", "--json"], { env });
    expect(JSON.parse(lista.stdout)).toMatchObject({ servicio: { vivo: false }, bots: [{ id: "vigia" }], rotos: [] });
  }, 60_000);
});
