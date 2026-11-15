import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { crearAvisador, emisoresDelEntorno, SCRIPT_DE_NOTIFICACION_WINDOWS, telegram, telegramPersistente, TRABADO_MS, xmlDeNotificacion, type Aviso, type Emisor } from "../src/nucleo/avisos.js";
import { Sesion } from "../src/tui/sesion.js";
import { leerEntrada, MODOS } from "../src/tui/teclas.js";

/**
 * Avisos donde estés: qué se avisa y cuándo (terminó, espera tu «dale», se trabó), sin repetir y
 * solo si no estás mirando la terminal. Los emisores van inyectados: acá no sale nada de verdad.
 */

describe("el avisador", () => {
  it("no repite la misma clave y respeta cuándo hace falta", async () => {
    const salidos: Aviso[] = [];
    let mirando = true;
    const avisador = crearAvisador([async (a) => void salidos.push(a)], () => !mirando);
    const aviso: Aviso = { tipo: "termino", titulo: "listo", texto: "x", clave: "equipo:1" };
    expect(await avisador.avisar(aviso)).toBe(false);
    mirando = false;
    expect(await avisador.avisar(aviso)).toBe(true);
    expect(await avisador.avisar(aviso)).toBe(false);
    expect(await avisador.avisar({ ...aviso, clave: "equipo:2" })).toBe(true);
    expect(salidos.map((a) => a.clave)).toEqual(["equipo:1", "equipo:2"]);
  });

  it("un emisor que falla no corta a los otros", async () => {
    const salidos: string[] = [];
    const avisador = crearAvisador([async () => Promise.reject(new Error("sin red")), async (a) => void salidos.push(a.clave)]);
    expect(await avisador.avisar({ tipo: "fallo", titulo: "t", texto: "x", clave: "a" })).toBe(true);
    expect(salidos).toEqual(["a"]);
  });

  it("la notificación de Windows: el script es fijo y el texto viaja aparte, escapado y recortado", () => {
    // Un texto con comillas tipográficas (PowerShell las toma como delimitadores) no llega nunca al script.
    const malicioso = "’); Start-Process calc; (’";
    expect(SCRIPT_DE_NOTIFICACION_WINDOWS).toContain("$env:DOLPHIN_AVISO_XML");
    expect(SCRIPT_DE_NOTIFICACION_WINDOWS).not.toContain("Start-Process");
    const xml = xmlDeNotificacion({ titulo: "Dolphin <listo>", texto: `${malicioso} & más\x1b[31m${"x".repeat(1000)}` });
    expect(xml).toContain("Dolphin &lt;listo&gt;");
    expect(xml).toContain("&amp; más");
    expect(xml).not.toContain("\x1b");
    expect(xml.length).toBeLessThan(500);
  });

  it("Telegram avisa aunque estés mirando la terminal; la notificación del sistema, no", async () => {
    const salidos: string[] = [];
    const sistema: Emisor = async () => void salidos.push("sistema");
    const tg: Emisor = Object.assign(async () => void salidos.push("telegram"), { siempre: true });
    const avisador = crearAvisador([sistema, tg], () => false);
    expect(await avisador.avisar({ tipo: "termino", titulo: "t", texto: "x", clave: "a" })).toBe(true);
    expect(salidos).toEqual(["telegram"]);
  });

  it("Telegram manda al chat del entorno, y sin token no se suma", async () => {
    const llamadas: { url: string; cuerpo: unknown }[] = [];
    const falso = (async (url: string, init?: { body?: string }) => {
      llamadas.push({ url, cuerpo: JSON.parse(init?.body ?? "{}") });
      return new Response("{}");
    }) as unknown as typeof fetch;
    await telegram("123:abc", "42", falso)({ tipo: "termino", titulo: "El equipo terminó", texto: "rama lista", clave: "x" });
    expect(llamadas[0]?.url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(llamadas[0]?.cuerpo).toMatchObject({ chat_id: "42", text: "El equipo terminó\nrama lista" });
    expect(emisoresDelEntorno({})).toHaveLength(1);
    expect(emisoresDelEntorno({ DOLPHIN_TELEGRAM_TOKEN: "t", DOLPHIN_TELEGRAM_CHAT: "c" })).toHaveLength(2);
  });
});

describe("la terminal avisa si perdió el foco", () => {
  it("lee el foco (modo 1004) y lo pide al abrir", () => {
    expect(leerEntrada("\x1b[O")).toEqual([{ tipo: "foco", enFoco: false }]);
    expect(leerEntrada("\x1b[Ihola")).toEqual([{ tipo: "foco", enFoco: true }, { tipo: "texto", texto: "hola" }]);
    expect(MODOS.prender).toContain("\x1b[?1004h");
    expect(MODOS.apagar).toContain("\x1b[?1004l");
  });
});

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-avisos-"));
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

describe("Telegram persistente", () => {
  afterEach(() => vi.useRealTimers());

  it("un aviso que no salió por falta de red se manda cuando vuelve, una sola vez entre dos procesos", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
    let red = false;
    const textos: string[] = [];
    const falso = (async (_url: string, init?: { body?: string }) => {
      if (!red) throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }) });
      await new Promise((r) => setTimeout(r, 2));
      textos.push(JSON.parse(init?.body ?? "{}").text);
      return new Response(JSON.stringify({ ok: true }));
    }) as unknown as typeof fetch;
    const emisor = telegramPersistente("123:abc", "42", repo, falso);
    await emisor({ tipo: "termino", titulo: "Listo", texto: "rama lista", clave: "x" });
    expect(textos).toEqual([]);
    red = true;
    vi.setSystemTime(new Date("2026-10-28T10:00:31Z"));
    // Otro proceso con el mismo repo: el candado en memoria no lo ve, el rename del archivo sí.
    const otro = telegramPersistente("123:abc", "42", repo + sep, falso);
    await Promise.all([emisor.retomar!(), otro.retomar!()]);
    expect(textos).toEqual(["Listo\nrama lista"]);
  });
});

describe("qué avisa la sesión", () => {
  it("cuando el plan espera el «dale» y cuando el equipo termina, una vez cada cosa", async () => {
    const avisos: Aviso[] = [];
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false, verificar: ["sintaxis"], avisador: crearAvisador([async (a) => void avisos.push(a)]) });
    const trabajo = sesion.recibir("/equipo exportar a CSV");
    // El plan lo arma un agente de mentira, pero el aviso sale de otro turno: se espera al aviso.
    await esperarA(() => sesion.esperaDale && avisos.length > 0, { tope: 60_000 });
    expect(avisos.map((a) => a.tipo)).toEqual(["espera"]);
    expect(avisos[0]?.texto).toContain("3 tareas");
    await sesion.recibir("dale");
    await trabajo;
    await esperarA(() => avisos.length > 1, { tope: 60_000 });
    expect(avisos.map((a) => a.tipo)).toEqual(["espera", "termino"]);
    expect(avisos[1]?.texto).toContain("pasó el portón");
    sesion.cerrar();
  }, 120_000);

  it("si un trabajo pasa TRABADO_MS sin ninguna señal, avisa que parece trabado (una vez)", async () => {
    let ahora = 1_000_000;
    const avisos: Aviso[] = [];
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, ahora: () => ahora, avisador: crearAvisador([async (a) => void avisos.push(a)]) });
    sesion.trabajo = { tipo: "equipo", desde: ahora, titulo: "exportar a CSV" };
    ahora += TRABADO_MS - 1000;
    sesion.revisarSiSeTrabo();
    ahora += 2000;
    sesion.revisarSiSeTrabo();
    sesion.revisarSiSeTrabo();
    // `revisarSiSeTrabo` no espera al emisor: el aviso sale en otro turno.
    await esperarA(() => avisos.length > 0);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ tipo: "trabado", titulo: "Dolphin parece trabado" });
    // Una señal de vida reinicia la cuenta: terminado, no avisa más.
    sesion.trabajo.terminado = ahora;
    ahora += TRABADO_MS * 2;
    sesion.revisarSiSeTrabo();
    expect(avisos).toHaveLength(1);
    sesion.cerrar();
  });
});
