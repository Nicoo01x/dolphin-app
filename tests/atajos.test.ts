import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { aprobarAtajo, atajoDelMensaje, contestarAtajo, correrAtajo, guardarAtajo, leerAtajo, listarAtajos, nombreDeAtajo, type EjecutarScript } from "../src/atajos.js";
import { abrirCanalTelegram } from "../src/tui/canal-telegram.js";
import type { Sesion } from "../src/tui/sesion.js";

// Nada se ejecuta de verdad: el script lo «corre» esta función y cuenta qué le llegó.
const corridos: string[] = [];
const ejecutar: EjecutarScript = async (atajo) => {
  corridos.push(atajo.script);
  return { codigo: 0, salida: "cerré 12 procesos" };
};

describe("atajos", () => {
  let dir = "";
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-atajos-"));
    process.env.DOLPHIN_ATAJOS_DIR = dir;
    corridos.length = 0;
  });
  afterEach(async () => {
    delete process.env.DOLPHIN_ATAJOS_DIR;
    await borrarCarpeta(dir);
  });

  it("el nombre sale limpio y sin barra: «/Modo Juego» es «modo-juego»", () => {
    expect(nombreDeAtajo("/Modo Juego")).toBe("modo-juego");
    expect(() => nombreDeAtajo("///")).toThrow();
  });

  it("guarda, lista y corre el mismo script siempre", async () => {
    await guardarAtajo({ nombre: "juego", script: "Stop-Process -Name XboxPcApp", descripcion: "todo menos Fortnite y Discord", revisado: true });
    expect((await listarAtajos()).map((a) => a.nombre)).toEqual(["juego"]);
    const r = await correrAtajo("juego", ejecutar);
    expect(r.salida).toBe("cerré 12 procesos");
    expect(corridos).toEqual(["Stop-Process -Name XboxPcApp"]);
    expect((await leerAtajo("juego"))?.ultima?.codigo).toBe(0);
  });

  it("uno que propuso un bot no corre hasta que lo aprobás", async () => {
    await guardarAtajo({ nombre: "limpiar", script: "Remove-Item C:\\tmp\\*", revisado: false });
    await expect(correrAtajo("limpiar", ejecutar)).rejects.toThrow(/todavía no lo revisaste/);
    expect(corridos).toEqual([]);
    await aprobarAtajo("limpiar");
    await correrAtajo("limpiar", ejecutar);
    expect(corridos).toHaveLength(1);
  });

  it("reconoce «/juego» y «/juego@MiBot» solo si el atajo existe", async () => {
    await guardarAtajo({ nombre: "juego", script: "x", revisado: true });
    expect(await atajoDelMensaje("/juego")).toBe("juego");
    expect(await atajoDelMensaje("/juego@DolphinBot")).toBe("juego");
    expect(await atajoDelMensaje("/memoria")).toBeUndefined();
    expect(await atajoDelMensaje("juego")).toBeUndefined();
  });

  it("la respuesta para el chat dice qué pasó, también cuando falla", async () => {
    expect(await contestarAtajo("no-existe", ejecutar)).toContain("no hay un atajo");
    await guardarAtajo({ nombre: "juego", script: "x", revisado: true });
    expect(await contestarAtajo("juego", ejecutar)).toContain("Listo: corrí «juego»");
  });

  it("por Telegram, «/juego» corre el atajo y no llega a la sesión (no gasta modelo)", async () => {
    await guardarAtajo({ nombre: "juego", script: "x", revisado: true });
    const recibidos: string[] = [];
    const enviados: string[] = [];
    const sesion = { alDecir: () => {}, recibir: async (t: string) => void recibidos.push(t) } as unknown as Sesion;
    const ahora = Math.floor(Date.now() / 1000);
    const pedir = (async (url: string, init?: { body?: string }) => {
      if (url.includes("getUpdates"))
        return new Response(JSON.stringify({ result: [{ update_id: 1, message: { chat: { id: 42 }, text: "/juego", date: ahora } }, { update_id: 2, message: { chat: { id: 42 }, text: "hola", date: ahora } }] }));
      enviados.push(JSON.parse(init?.body ?? "{}").text);
      return new Response("{}");
    }) as unknown as typeof fetch;
    const canal = abrirCanalTelegram({ token: "t", chat: "42", sesion, pedir, correrAtajo: (n) => contestarAtajo(n, ejecutar) });
    await canal.vuelta();
    // El atajo y el mensaje siguen en segundo plano: se espera a que la respuesta esté mandada.
    await esperarA(() => recibidos.length > 0 && enviados.some((t) => t.includes("Listo: corrí «juego»")));
    expect(recibidos).toEqual(["hola"]);
    expect(corridos).toHaveLength(1);
    expect(enviados.some((t) => t.includes("Listo: corrí «juego»"))).toBe(true);
  });

  it("por Telegram baja un archivo, lo trata como dato externo y lo adjunta al mensaje siguiente", async () => {
    const repo = await mkdtemp(join(tmpdir(), "dolphin-telegram-repo-"));
    const recibidos: string[] = [];
    const enviados: { texto: string; tema?: number }[] = [];
    let ronda = 0;
    const sesion = { config: { repo }, alDecir: () => {}, recibir: async (t: string) => void recibidos.push(t) } as unknown as Sesion;
    const pedir = (async (url: string, init?: { body?: string }) => {
      if (url.includes("getUpdates")) {
        ronda++;
        const mensaje = ronda === 1
          ? { update_id: 1, message: { chat: { id: 42 }, message_thread_id: 9, text: "/atar", date: Math.floor(Date.now() / 1000) } }
          : ronda === 2
            ? { update_id: 2, message: { chat: { id: 42 }, message_thread_id: 9, document: { file_id: "x", file_name: "../nota.txt", file_size: 4 }, date: Math.floor(Date.now() / 1000) } }
            : { update_id: 3, message: { chat: { id: 42 }, message_thread_id: 9, text: "miralo", date: Math.floor(Date.now() / 1000) } };
        return new Response(JSON.stringify({ ok: true, result: [mensaje] }));
      }
      if (url.includes("getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "documents/nota.txt", file_size: 4 } }));
      if (url.includes("/file/bot")) return new Response("dato");
      const cuerpo = JSON.parse(init?.body ?? "{}") as { text?: string; message_thread_id?: number };
      enviados.push({ texto: cuerpo.text ?? "", ...(cuerpo.message_thread_id ? { tema: cuerpo.message_thread_id } : {}) });
      return new Response(JSON.stringify({ ok: true }));
    }) as unknown as typeof fetch;
    const canal = abrirCanalTelegram({ token: "t", chat: "42", sesion, pedir });
    await canal.vuelta();
    await canal.vuelta();
    await canal.vuelta();
    // El archivo se baja y se adjunta en segundo plano: se espera al mensaje con el dato, no a un rato.
    await esperarA(() => recibidos.length > 0 && enviados.length > 0);
    expect(recibidos[0]).toContain("DATO DE AFUERA");
    expect(recibidos[0]).toContain("nota.txt");
    expect(enviados[0]).toMatchObject({ tema: 9 });
    await borrarCarpeta(repo);
  });
});
