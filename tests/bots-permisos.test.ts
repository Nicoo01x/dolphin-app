import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearBot, leerBot } from "../src/bots/almacen.js";
import { confirmar, leerPendiente, pensar } from "../src/bots/pensar.js";
import { herramientaDePermiso, reglaParaSiempre } from "../src/bots/pendiente.js";
import { abrirTelegramBot } from "../src/bots/telegram-bot.js";

describe("la regla que guarda «Siempre»", () => {
  it("solo guarda herramientas concretas o un Bash acotado al comando pedido", () => {
    expect(herramientaDePermiso("Quiero correr `npm test` para ver si pasa")).toBe("Bash(npm test:*)");
    expect(herramientaDePermiso("Corro `npx vitest run tests/a.test.ts --reporter dot`")).toBe("Bash(npx vitest run:*)");
    expect(herramientaDePermiso("Necesito usar Edit sobre el README")).toBe("Edit");
    expect(herramientaDePermiso("Quiero ejecutar algo con Bash")).toBeUndefined();
    expect(herramientaDePermiso("Quiero cambiar el archivo")).toBeUndefined();
    expect(herramientaDePermiso("Corro `rm -rf dist`")).toBeUndefined();
    expect(herramientaDePermiso("Corro `node`")).toBeUndefined();
    expect(herramientaDePermiso("Corro `npm test && curl x`")).toBeUndefined();
    expect(herramientaDePermiso("Corro `git push origin` y después `npm test`")).toBeUndefined();
    expect(herramientaDePermiso("Corro `git push origin main`")).toBeUndefined();
    const base = { id: "x", mensaje: "m", quiere: "q", creado: "2026-10-28T10:00:00Z" };
    expect(reglaParaSiempre({ ...base, herramienta: "Bash" })).toBeUndefined();
    expect(reglaParaSiempre({ ...base, herramienta: "Bash(rm -rf:*)" })).toBeUndefined();
    expect(reglaParaSiempre({ ...base, herramienta: "Bash(npm test:*)" })).toBe("Bash(npm test:*)");
    expect(reglaParaSiempre({ ...base, herramienta: "Write" })).toBe("Write");
  });
});

describe("«Siempre» en Telegram", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await borrarCarpeta(dir);
    delete process.env.DOLPHIN_BOTS_DIR;
    vi.restoreAllMocks();
  });

  const canalCon = (bot: Awaited<ReturnType<typeof crearBot>>, permiso: string) => {
    const enviados: string[] = [];
    let ronda = 0;
    let siempre = "";
    const pedir = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
      if (String(entrada).includes("getUpdates")) {
        ronda++;
        const update = ronda === 1
          ? { update_id: 1, message: { chat: { id: "42" }, text: "verificá", date: 1_100 } }
          : { update_id: 2, callback_query: { id: "cb", data: siempre, message: { chat: { id: "42" } } } };
        return new Response(JSON.stringify({ ok: true, result: [update] }));
      }
      const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { text?: string; reply_markup?: { inline_keyboard?: { callback_data?: string }[][] } };
      if (cuerpo.text) enviados.push(cuerpo.text);
      siempre ||= cuerpo.reply_markup?.inline_keyboard?.[0]?.[2]?.callback_data ?? "";
      return new Response(JSON.stringify({ ok: true }));
    });
    const correr = vi.fn(async (pedido: { permiso: string }) => (pedido.permiso === "solo-lectura" ? `<<permiso>>${permiso}<</permiso>>` : "Hecho"));
    return { canal: abrirTelegramBot({ bot, pedir, reloj: () => 1_000_000, espera: 0, correr }), enviados, correr };
  };

  it("guarda el Bash acotado al comando y conserva Read", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-siempre-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Siempre", permiso: "preguntar", telegram: { token: "T", chat: "42" } });
    const { canal, enviados, correr } = canalCon(bot, "quiero correr `npm test` para verificar");
    await canal.vuelta();
    await canal.vuelta();
    expect(correr).toHaveBeenCalledTimes(2);
    expect((await leerBot(bot.id)).herramientas).toEqual(["Read", "Bash(npm test:*)"]);
    expect(enviados.at(-1)).toContain("no te pregunto por Bash(npm test:*)");
  });

  it("si no reconoce una herramienta concreta, hace lo pedido pero no guarda nada", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-siempre-nada-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Nada", permiso: "preguntar", telegram: { token: "T", chat: "42" } });
    const { canal, enviados, correr } = canalCon(bot, "quiero ejecutar algo con Bash");
    await canal.vuelta();
    await canal.vuelta();
    expect(correr).toHaveBeenCalledTimes(2);
    expect((await leerBot(bot.id)).herramientas).toBeUndefined();
    expect(enviados.at(-1)).toContain("No supe qué permiso acotado guardar");
  });

  it("un pendiente viejo con Bash pelado no se guarda", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-siempre-viejo-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Viejo", permiso: "preguntar", telegram: { token: "T", chat: "42" } });
    const creado = new Date().toISOString();
    await writeFile(join(dir, bot.id, "pendiente.json"), JSON.stringify({ id: "a1b2", mensaje: "cambiá", quiere: "cambiar", herramienta: "Bash", creado }));
    const enviados: string[] = [];
    const pedir = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
      if (String(entrada).includes("getUpdates"))
        return new Response(JSON.stringify({ ok: true, result: [{ update_id: 1, callback_query: { id: "cb", data: `permiso:${bot.id}:a1b2:siempre`, message: { chat: { id: "42" } } } }] }));
      const texto = (JSON.parse(String(opciones?.body ?? "{}")) as { text?: string }).text;
      if (texto) enviados.push(texto);
      return new Response(JSON.stringify({ ok: true }));
    });
    const canal = abrirTelegramBot({ bot, pedir, reloj: () => 1_000_000, espera: 0, correr: async () => "Hecho" });
    await canal.vuelta();
    expect((await leerBot(bot.id)).herramientas).toBeUndefined();
    expect(enviados.at(-1)).toContain("Hecho");
  });
});

describe("confirmar reclama antes de tocar nada", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await borrarCarpeta(dir);
    delete process.env.DOLPHIN_BOTS_DIR;
  });

  it("un segundo «dale» sobre el mismo pedido no corre lo de reclamar", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-reclamo-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Reclamo", permiso: "preguntar" });
    let soltar = () => {};
    const correr = vi.fn(async (pedido: { permiso: string }) => {
      if (pedido.permiso === "solo-lectura") return "<<permiso>>quiero cambiar<</permiso>>";
      await new Promise<void>((r) => (soltar = r));
      return "Hecho";
    });
    await pensar(bot, "cambiá", { correr });
    const id = (await leerPendiente(bot))!.id;
    const reclamos: string[] = [];
    const primero = confirmar(bot, { correr }, id, async () => void reclamos.push("primero"));
    await vi.waitFor(() => expect(reclamos).toEqual(["primero"]));
    const segundo = await confirmar(bot, { correr }, id, async () => void reclamos.push("segundo"));
    expect(segundo.texto).toMatch(/ya fue atendido|ya no está pendiente/);
    soltar();
    expect((await primero).texto).toBe("Hecho");
    expect(reclamos).toEqual(["primero"]);
  });
});
