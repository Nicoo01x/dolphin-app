import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Bufer, sinControl } from "../src/tui/celdas.js";
import { abrirCanalTelegram } from "../src/tui/canal-telegram.js";
import { leerProgramacion } from "../src/tui/programar.js";
import { Sesion } from "../src/tui/sesion.js";
import { crearLector } from "../src/tui/teclas.js";

/**
 * Lo que encontró la revisión de la app de terminal (27/10), para que no vuelva: un pegado largo que
 * llega en pedazos, caracteres de control de afuera, dos pedidos a la vez, mensajes viejos de Telegram,
 * la hora de /programar y una carpeta que ya existía.
 */

describe("la entrada y la pantalla", () => {
  it("un pegado partido en varios trozos es UN pegado: sus renglones no son Enter", () => {
    const leer = crearLector();
    expect(leer("\x1b[200~primer renglón\r\nsegundo\r\nda")).toEqual([]);
    expect(leer("le\r\nfin\x1b[201~")).toEqual([{ tipo: "pegar", texto: "primer renglón\nsegundo\ndale\nfin" }]);
    // Una secuencia cortada al final espera al próximo trozo; un Escape solo, no.
    expect(leer("\x1b[")).toEqual([]);
    expect(leer("A")).toEqual([{ tipo: "tecla", nombre: "arriba", ctrl: false, alt: false, shift: false }]);
    expect(leer("\x1b")).toEqual([{ tipo: "tecla", nombre: "escape", ctrl: false, alt: false, shift: false }]);
  });

  it("lo que viene de afuera no le manda órdenes a la terminal", () => {
    expect(sinControl("hola\r\x1b]52;c;ZXZpbA==\x07 mundo\x1b[31m rojo")).toBe("hola  mundo rojo");
    const b = new Bufer(30, 1);
    b.texto(0, 0, "a\x1b[2Jb\rc");
    expect(b.comoTexto()[0]).toBe("ab c");
  });

  it("/programar: la primera hora es la hora; un número después es parte de la tarea", () => {
    const p = leerProgramacion("02:00 20 tests nuevos", new Date(2026, 9, 27, 14, 0));
    expect(p?.tarea).toBe("20 tests nuevos");
    expect(p?.cuando.getHours()).toBe(2);
  });
});

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-revision-"));
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
  await rm(repo, { recursive: true, force: true, maxRetries: 3 });
});

describe("la sesión", () => {
  it("dos pedidos en la misma vuelta no arrancan dos equipos", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] });
    const uno = sesion.recibir("/equipo exportar a CSV");
    const otro = sesion.recibir("/equipo importar de Excel");
    await Promise.all([uno, otro]);
    expect(sesion.mensajes.some((m) => m.texto.startsWith("Estoy con «exportar a CSV»"))).toBe(true);
    expect(sesion.equipo?.objetivo).toBe("exportar a CSV");
    sesion.cerrar();
  }, 120_000);

  it("un proyecto nuevo no se arma en una carpeta que ya tiene cosas", async () => {
    await mkdir(join(repo, "facturacion"));
    await writeFile(join(repo, "facturacion", "notas.txt"), "mío");
    const sesion = new Sesion({
      repo,
      agente: "mentira",
      automatico: false,
      sinRepo: true,
      pensar: async () => ({ decision: { tipo: "proyecto", resumen: "x", prompt: "Una app.", preguntas: ["¿?"], carpeta: "facturacion" }, gastado: 0 }),
    });
    await sesion.recibir("armame la facturación");
    expect(await sesion.recibir("dale")).toBeUndefined();
    expect(sesion.mensajes.at(-1)?.texto).toContain("no la toco");
    expect(await readdir(join(repo, "facturacion"))).toEqual(["notas.txt"]);
    sesion.cerrar();
  });

  it("Telegram no ejecuta lo que se escribió antes de arrancar", async () => {
    const enviados: string[] = [];
    let entregado = false;
    const pedir = (async (url: string, init?: { body?: string }) => {
      if (url.includes("/sendMessage")) {
        enviados.push(JSON.parse(init?.body ?? "{}").text);
        return new Response("{}");
      }
      const viejo = { update_id: 1, message: { chat: { id: 42 }, text: "/equipo algo de ayer", date: Math.floor(Date.now() / 1000) - 3600 } };
      const result = entregado ? [] : [viejo];
      entregado = true;
      return new Response(JSON.stringify({ ok: true, result }));
    }) as unknown as typeof fetch;
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false });
    const canal = abrirCanalTelegram({ token: "t", chat: "42", sesion, pedir });
    expect(await canal.vuelta()).toBe(0);
    expect(sesion.mensajes).toHaveLength(0);
    sesion.cerrar();
  });
});
