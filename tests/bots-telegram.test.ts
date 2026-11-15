import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearBot, leerMemoria } from "../src/bots/almacen.js";
import { abrirTelegramBot } from "../src/bots/telegram-bot.js";
import { confirmar, leerPendiente, pensar, rechazarPendiente } from "../src/bots/pensar.js";
import { puedeCorrer, registrarCorrida } from "../src/bots/presupuesto.js";

describe("Telegram de bots", () => {
  let dir = "";
  let carpeta = "";
  afterEach(async () => {
    if (dir) await borrarCarpeta(dir);
    if (carpeta) await borrarCarpeta(carpeta);
    carpeta = "";
    delete process.env.DOLPHIN_BOTS_DIR;
    vi.restoreAllMocks();
  });

  it("atiende sólo su chat, descarta lo viejo y resuelve comandos locales", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-telegram-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Canal", telegram: { token: "TOKEN", chat: "42" } });
    const enviados: string[] = [];
    const pedir = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
      const url = String(entrada);
      if (url.includes("getUpdates"))
        return new Response(
          JSON.stringify({
            ok: true,
            result: [
              { update_id: 1, message: { chat: { id: "99" }, text: "no me atiendas", date: 200 } },
              { update_id: 2, message: { chat: { id: "42" }, text: "viejo", date: 900 } },
              { update_id: 3, message: { chat: { id: "42" }, text: "/memoria", date: 1_100 } },
            ],
          }),
        );
      enviados.push(JSON.parse(String(opciones?.body)).text);
      return new Response(JSON.stringify({ ok: true }));
    });
    const botTelegram = abrirTelegramBot({ bot, pedir, reloj: () => 1_000_000, espera: 0, correr: async () => "no debería gastar motor" });
    await botTelegram.vuelta();
    await vi.waitFor(() => expect(enviados).toEqual(["No hay recuerdos guardados."]));
    expect(pedir).toHaveBeenCalled();
  });

  it("manda dale al motor con permisos cuando había una operación pendiente", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-telegram-permiso-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Permiso", permiso: "preguntar", telegram: { token: "TOKEN", chat: "42" } });
    const enviados: string[] = [];
    let ronda = 0;
    const pedir = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
      const url = String(entrada);
      if (url.includes("getUpdates")) {
        ronda++;
        return new Response(
          JSON.stringify({
            ok: true,
            result:
              ronda === 1
                ? [{ update_id: 1, message: { chat: { id: "42" }, text: "cambiá el archivo", date: 1_100 } }]
                : [{ update_id: 2, message: { chat: { id: "42" }, text: "dale", date: 1_101 } }],
          }),
        );
      }
      enviados.push(JSON.parse(String(opciones?.body)).text);
      return new Response(JSON.stringify({ ok: true }));
    });
    const correr = vi.fn(async (pedido: { permiso: string }) =>
      pedido.permiso === "solo-lectura" ? "<<permiso>>quiero cambiar el archivo<</permiso>>" : "Hecho",
    );
    const canal = abrirTelegramBot({ bot, pedir, reloj: () => 1_000_000, espera: 0, correr });
    await canal.vuelta();
    await canal.vuelta();
    expect(correr).toHaveBeenCalledTimes(2);
    expect(correr.mock.calls[0]?.[0].permiso).toBe("solo-lectura");
    expect(correr.mock.calls[1]?.[0].permiso).toBe("permisos");
    expect(enviados.join("\n")).toContain("Hecho");
    expect(await leerMemoria(bot.id)).toBe("");
  });

  it("aprueba una acción con el botón y sólo acepta el callback del chat dueño", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-telegram-boton-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Botón", permiso: "preguntar", telegram: { token: "TOKEN", chat: "42" } });
    const cuerpos: Record<string, unknown>[] = [];
    let ronda = 0;
    let callback = "";
    const pedir = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
      const url = String(entrada);
      if (url.includes("getUpdates")) {
        ronda++;
        const update = ronda === 1
          ? { update_id: 1, message: { chat: { id: "42" }, text: "cambiá el archivo", date: 1_100 } }
          : { update_id: 2, callback_query: { id: "cb", data: callback, message: { chat: { id: "42" } } } };
        return new Response(JSON.stringify({ ok: true, result: [update] }));
      }
      const cuerpo = JSON.parse(String(opciones?.body)) as Record<string, unknown>;
      cuerpos.push(cuerpo);
      const teclado = cuerpo.reply_markup as { inline_keyboard?: { callback_data?: string }[][] } | undefined;
      callback ||= teclado?.inline_keyboard?.[0]?.[0]?.callback_data ?? "";
      return new Response(JSON.stringify({ ok: true }));
    });
    const correr = vi.fn(async (pedido: { permiso: string }) => pedido.permiso === "solo-lectura" ? "<<permiso>>quiero cambiar<</permiso>>" : "Hecho");
    const canal = abrirTelegramBot({ bot, pedir, reloj: () => 1_000_000, espera: 0, correr });
    await canal.vuelta();
    await canal.vuelta();
    expect(callback).toMatch(/^permiso:boton:[a-f0-9-]+:aprobar$/);
    expect(cuerpos.some((x) => x.text === "Hecho")).toBe(true);
    expect(correr).toHaveBeenCalledTimes(2);
  });

  it("el botón corre en la fila de mensajes, ocupa el bot y no acepta botones de otro bot", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-telegram-fila-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Fila", permiso: "preguntar", telegram: { token: "TOKEN", chat: "42" } });
    let ronda = 0;
    let callback = "";
    const pedir = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
      if (String(entrada).includes("getUpdates")) {
        ronda++;
        const result = ronda === 1
          ? [{ update_id: 1, message: { chat: { id: "42" }, text: "cambiá el archivo", date: 1_100 } }]
          : ronda === 2
            ? [{ update_id: 2, callback_query: { id: "cb", data: callback.replace(`permiso:${bot.id}:`, "permiso:otro-bot:"), message: { chat: { id: "42" } } } }]
            : [{ update_id: 3, callback_query: { id: "cb2", data: callback, message: { chat: { id: "42" } } } }];
        return new Response(JSON.stringify({ ok: true, result }));
      }
      const cuerpo = JSON.parse(String(opciones?.body ?? "{}")) as { reply_markup?: { inline_keyboard?: { callback_data?: string }[][] } };
      callback ||= cuerpo.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data ?? "";
      return new Response(JSON.stringify({ ok: true }));
    });
    let soltar = () => {};
    const correr = vi.fn(async (pedido: { permiso: string }) => {
      if (pedido.permiso === "solo-lectura") return "<<permiso>>quiero cambiar<</permiso>>";
      await new Promise<void>((r) => (soltar = r));
      return "Hecho";
    });
    const canal = abrirTelegramBot({ bot, pedir, reloj: () => 1_000_000, espera: 0, correr });
    await canal.vuelta();
    await canal.vuelta();
    expect(correr).toHaveBeenCalledTimes(1);
    const vuelta = canal.vuelta();
    await vi.waitFor(() => expect(correr).toHaveBeenCalledTimes(2));
    expect(canal.estaLibre?.()).toBe(false);
    soltar();
    await vuelta;
    expect(canal.estaLibre?.()).toBe(true);
  });

  it("«Rechazar» no contesta rechazado mientras un «dale» ya lo está corriendo", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-telegram-rechazo-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Rechazo", permiso: "preguntar" });
    let soltar = () => {};
    const correr = vi.fn(async (pedido: { permiso: string }) => {
      if (pedido.permiso === "solo-lectura") return "<<permiso>>quiero cambiar<</permiso>>";
      await new Promise<void>((r) => (soltar = r));
      return "Hecho";
    });
    await pensar(bot, "cambiá", { correr });
    const id = (await leerPendiente(bot))!.id;
    const dale = confirmar(bot, { correr }, id);
    await vi.waitFor(() => expect(correr).toHaveBeenCalledTimes(2));
    expect(await rechazarPendiente(bot, id)).toBe(false);
    soltar();
    expect((await dale).texto).toBe("Hecho");
  });

  it("«seguí» acepta una pausa que marcó un disparo aunque no haya pedido de charla esperando", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-telegram-segui-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const bot = await crearBot({ nombre: "Segui", presupuesto: { avisoCorridasPorMes: 1 }, telegram: { token: "TOKEN", chat: "42" } });
    await registrarCorrida(bot, undefined);
    const enviados: string[] = [];
    const pedir = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
      if (String(entrada).includes("getUpdates")) return new Response(JSON.stringify({ ok: true, result: [{ update_id: 1, message: { chat: { id: "42" }, text: "seguí", date: 1_100 } }] }));
      enviados.push(JSON.parse(String(opciones?.body)).text);
      return new Response(JSON.stringify({ ok: true }));
    });
    const correr = vi.fn(async () => "no debería");
    await abrirTelegramBot({ bot, pedir, reloj: () => 1_000_000, espera: 0, correr }).vuelta();
    expect(enviados).toEqual(["Sigo: lo que estaba esperando sale en la próxima vuelta."]);
    expect(correr).not.toHaveBeenCalled();
    expect((await puedeCorrer(bot)).puede).toBe(true);
  });

  it("baja documentos, los marca como datos externos y menciona la ruta en el mensaje siguiente", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-telegram-archivo-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-bot-repo-"));
    const bot = await crearBot({ nombre: "Archivos", carpeta, permiso: "libre", telegram: { token: "TOKEN", chat: "42" } });
    const prompts: string[] = [];
    const enviados: string[] = [];
    let ronda = 0;
    const pedir = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
      const url = String(entrada);
      if (url.includes("getUpdates")) {
        ronda++;
        return new Response(JSON.stringify({
          ok: true,
          result: ronda === 1
            ? [{ update_id: 1, message: { chat: { id: "42" }, document: { file_id: "f1", file_name: "../informe final.txt", file_size: 4 }, date: 1_100 } }]
            : [{ update_id: 2, message: { chat: { id: "42" }, text: "resumilo", date: 1_101 } }],
        }));
      }
      if (url.includes("getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "documents/informe.txt", file_size: 4 } }));
      if (url.includes("/file/bot")) return new Response("dato");
      enviados.push(JSON.parse(String(opciones?.body)).text);
      return new Response(JSON.stringify({ ok: true }));
    });
    const canal = abrirTelegramBot({ bot, pedir, reloj: () => 1_000_000, espera: 0, correr: async ({ prompt }) => (prompts.push(prompt), "Listo") });
    await canal.vuelta();
    await canal.vuelta();
    await vi.waitFor(() => expect(prompts).toHaveLength(1));
    expect(prompts[0]).toContain("DATO DE AFUERA");
    expect(prompts[0]).toContain("informe_final.txt");
    expect(enviados[0]).toContain("Guardé el dato externo");
  });
});
