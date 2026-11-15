import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { leerCalendario } from "../src/nucleo/calendario.js";
import { abrirCanalTelegram } from "../src/tui/canal-telegram.js";
import { buscarEnCharla, leerCharla } from "../src/tui/charla-guardada.js";
import { leerProgramacion } from "../src/tui/programar.js";
import { Sesion } from "../src/tui/sesion.js";

/**
 * Lo mejor de OpenClaw y Hermes, en la terminal: la charla que no se pierde entre sesiones (y se
 * busca), las tareas programadas en el calendario de siempre, y Dolphin por Telegram.
 */

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-canales-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module", scripts: { sintaxis: "node --check src/a.js" } }));
  await writeFile(join(repo, "src", "a.js"), "export const suma = (a, b) => a + b\n");
  await git(["init", "-q"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});
afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

// El sondeo es el de `ayuda/esperar.ts`; acá queda el expect, porque algunas de estas esperas no
// tienen un expect propio abajo y una lista vacía las dejaría pasar sin que hubiera pasado nada.
const esperar = async (cumple: () => boolean | Promise<boolean>, tope = 20_000) => {
  await esperarA(cumple, { tope });
  expect(await cumple(), "no pasó a tiempo").toBe(true);
};

describe("la charla entre sesiones", () => {
  it("se anota, vuelve al abrir otra sesión y /buscar la encuentra", async () => {
    const una = new Sesion({ repo, agente: "mentira", automatico: false, guardarCharla: true });
    await una.recibir("hola");
    await una.recibir("/idea exportar las facturas a PDF");
    una.cerrar();
    await esperar(async () => (await leerCharla(repo)).length >= 4);
    // El sistema no se anota: solo lo que dijiste vos y lo que dijo Dolphin.
    expect((await leerCharla(repo)).every((m) => m.quien === "vos" || m.quien === "dolphin")).toBe(true);

    const otra = new Sesion({ repo, agente: "mentira", automatico: false, guardarCharla: true });
    await otra.cargarHistoria();
    expect(otra.mensajes[0]?.texto).toMatch(/^La charla de antes/);
    expect(otra.mensajes.some((m) => m.texto === "/idea exportar las facturas a PDF")).toBe(true);
    await otra.recibir("/buscar facturas pdf");
    expect(otra.mensajes.at(-1)?.texto).toMatch(/Encontré 1:\n.* · vos: \/idea exportar las facturas a PDF/);
    expect(await buscarEnCharla(repo, "nada parecido")).toEqual([]);
    otra.cerrar();
  });
});

describe("tareas programadas", () => {
  const ahora = new Date(2026, 9, 27, 14, 30);
  it("entiende la hora, «mañana» y «diario»; si la hora ya pasó, es mañana", () => {
    expect(leerProgramacion("15:00 revisá las dependencias", ahora)).toMatchObject({ diario: false, tarea: "revisá las dependencias" });
    expect(leerProgramacion("15:00 x", ahora)?.cuando.getDate()).toBe(27);
    expect(leerProgramacion("09:00 x", ahora)?.cuando.getDate()).toBe(28);
    expect(leerProgramacion("mañana 15 x", ahora)?.cuando.getDate()).toBe(28);
    expect(leerProgramacion("diario a las 3 x", ahora)).toMatchObject({ diario: true, tarea: "x" });
    expect(leerProgramacion("revisá todo", ahora)).toBeUndefined();
    expect(leerProgramacion("25:00 x", ahora)).toBeUndefined();
  });

  it("/programar deja el turno en el calendario de siempre, firmado", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false });
    await sesion.recibir("/programar diario 03:00 actualizá las dependencias");
    const { turnos } = await leerCalendario(repo);
    expect(turnos).toHaveLength(1);
    expect(turnos[0]).toMatchObject({ tareas: ["actualizá las dependencias"], repetir: "diario", hora: "03:00", agente: "mentira", estado: "agendado" });
    expect(turnos[0]?.firma).toBeTruthy();
    expect(sesion.mensajes.at(-1)?.texto).toContain("todos los días a las 03:00");
    sesion.cerrar();
  });
});

describe("Dolphin por Telegram", () => {
  /** Una API de Telegram de mentira: entrega los mensajes que le pongan y anota lo que se manda. */
  function telegramDeMentira() {
    const pendientes: unknown[] = [];
    const enviados: { chat_id: string; text: string }[] = [];
    let id = 1;
    const llegar = (chat: number, texto: string) => pendientes.push({ update_id: id++, message: { chat: { id: chat }, text: texto } });
    const pedir = (async (url: string, init?: { body?: string }) => {
      if (url.includes("/sendMessage")) {
        enviados.push(JSON.parse(init?.body ?? "{}"));
        return new Response("{}");
      }
      const result = pendientes.splice(0);
      return new Response(JSON.stringify({ ok: true, result }));
    }) as unknown as typeof fetch;
    return { llegar, pedir, enviados };
  }

  it("atiende solo al chat autorizado y contesta por el mismo chat", async () => {
    const tg = telegramDeMentira();
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false });
    const ignorados: string[] = [];
    const canal = abrirCanalTelegram({ token: "t", chat: "42", sesion, pedir: tg.pedir, contar: (x) => ignorados.push(x) });
    tg.llegar(999, "borrá todo");
    tg.llegar(42, "hola");
    expect(await canal.vuelta()).toBe(1);
    await esperar(() => tg.enviados.length > 0);
    expect(tg.enviados[0]).toMatchObject({ chat_id: "42" });
    expect(ignorados.some((x) => x.startsWith("ignoro un mensaje de otro chat (999"))).toBe(true);
    expect(sesion.mensajes.some((m) => m.texto === "borrá todo")).toBe(false);
    sesion.cerrar();
  });

  it("un «dale» por Telegram arranca el plan que espera", async () => {
    const tg = telegramDeMentira();
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false, verificar: ["sintaxis"] });
    const canal = abrirCanalTelegram({ token: "t", chat: "42", sesion, pedir: tg.pedir });
    tg.llegar(42, "/equipo exportar a CSV");
    await canal.vuelta();
    await esperar(() => sesion.esperaDale);
    expect(tg.enviados.some((m) => m.text.includes("¿Arranco?"))).toBe(true);
    tg.llegar(42, "dale");
    await canal.vuelta();
    await esperar(() => !!sesion.equipo?.fin, 60_000);
    expect(sesion.equipo?.fin?.rama).toMatch(/^dolphin-equipo\//);
    await esperar(() => tg.enviados.some((m) => m.text.startsWith("Listo en")));
    sesion.cerrar();
  }, 120_000);
});
