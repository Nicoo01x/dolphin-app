import { execFile } from "node:child_process";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { recordar } from "../src/nucleo/memoria.js";
import { leerProyectos } from "../src/nucleo/proyectos.js";
import { esAprobacion, leerDecision, nombreDeCarpeta, pensarConReglas, promptDePensar, type Pensador } from "../src/tui/pensar.js";
import { Sesion } from "../src/tui/sesion.js";

/**
 * Dolphin piensa antes de actuar: un saludo no arma un equipo, una tarea chica va a un agente y un
 * proyecto serio primero mejora el pedido y pregunta. Quien piensa es de mentira (no gasta nada);
 * lo que se prueba es qué hace Dolphin con cada decisión.
 */

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-pensar-"));
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

describe("leer lo que decidió el modelo", () => {
  it("entiende las tres decisiones y descarta lo que no sirve", () => {
    expect(leerDecision('{"tipo": "charla", "respuesta": "hola"}')).toEqual({ tipo: "charla", respuesta: "hola" });
    expect(leerDecision('bla {"tipo": "tarea", "tarea": "arreglá el botón"} bla')).toEqual({ tipo: "tarea", tarea: "arreglá el botón" });
    const p = leerDecision('{"tipo": "proyecto", "resumen": "una tienda", "prompt": "armá una tienda", "preguntas": ["¿pagos?", 3, "", "a", "b", "c"], "carpeta": "Mi Tienda Ñandú"}');
    expect(p).toMatchObject({ tipo: "proyecto", prompt: "armá una tienda", carpeta: "mi-tienda-nandu" });
    expect(p && p.tipo === "proyecto" ? p.preguntas : []).toEqual(["¿pagos?", "a", "b", "c"]);
    expect(leerDecision('{"tipo": "tarea"}')).toBeUndefined();
    expect(leerDecision("no es json")).toBeUndefined();
  });

  it("el pedido al modelo lleva la memoria y lo último de la charla", () => {
    const prompt = promptDePensar({ pedido: "sumá un botón", memoria: "- nunca usar any", charla: [{ quien: "persona", texto: "hola" }], sinRepo: false, repo });
    expect(prompt).toContain("nunca usar any");
    expect(prompt).toContain("persona: hola");
    expect(prompt).not.toContain("carpeta");
  });

  it("aprobaciones y nombres de carpeta", () => {
    expect(esAprobacion("dale")).toBe(true);
    expect(esAprobacion("Sí!")).toBe(true);
    expect(esAprobacion("dale pero con pagos")).toBe(false);
    expect(nombreDeCarpeta("  App de Turnos!! ")).toBe("app-de-turnos");
  });
});

describe("las reglas (sin modelo)", () => {
  const ctx = (pedido: string, sinRepo = false) => ({ pedido, memoria: "", charla: [], sinRepo, repo });
  it("un saludo es charla, un cambio chico es tarea y una app es un proyecto", async () => {
    expect((await pensarConReglas(ctx("hola!"))).decision.tipo).toBe("charla");
    expect((await pensarConReglas(ctx("arreglá el color del botón de guardar"))).decision.tipo).toBe("tarea");
    const p = (await pensarConReglas(ctx("armá una app de turnos para peluquerías", true))).decision;
    expect(p.tipo).toBe("proyecto");
    expect(p.tipo === "proyecto" ? p.carpeta : "").toBe("arma-una-app-de");
  });
});

/** Un pensador de mentira que contesta lo que le digan y anota qué recibió. */
function pensadorQue(decision: Awaited<ReturnType<Pensador>>["decision"], vistos: string[] = []): Pensador {
  return async (c) => {
    vistos.push(c.memoria);
    return { decision, gastado: 0 };
  };
}

describe("Dolphin decide qué hacer", () => {
  it("un «hola» se contesta y no arma ningún equipo", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false });
    await sesion.recibir("hola");
    expect(sesion.mensajes.at(-1)).toMatchObject({ quien: "dolphin" });
    expect(sesion.trabajo).toBeNull();
    expect(sesion.equipo).toBeNull();
  });

  it("piensa con la memoria del proyecto adelante", async () => {
    await recordar(repo, "los botones van con texto, nunca solo un ícono", undefined, "regla", { origen: "owner" });
    const vistos: string[] = [];
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false, pensar: pensadorQue({ tipo: "charla", respuesta: "ok" }, vistos) });
    await sesion.recibir("¿cómo hago los botones?");
    expect(vistos[0]).toContain("nunca solo un ícono");
  });

  it("un proyecto serio mejora el pedido, pregunta, y con las respuestas arranca el equipo", async () => {
    const sesion = new Sesion({
      repo,
      agente: "mentira",
      automatico: true,
      verificar: ["sintaxis"],
      pensar: pensadorQue({ tipo: "proyecto", resumen: "exportar pedidos", prompt: "Exportar los pedidos a CSV con filtros.", preguntas: ["¿Con qué columnas?"] }),
    });
    await sesion.recibir("quiero exportar pedidos");
    expect(sesion.propuesta).toMatchObject({ prompt: "Exportar los pedidos a CSV con filtros." });
    expect(sesion.mensajes.at(-1)?.texto).toContain("1. ¿Con qué columnas?");
    expect(sesion.trabajo).toBeNull();
    // La respuesta viaja con el pedido mejorado y recién ahí trabaja el equipo.
    await sesion.recibir("fecha, cliente y total");
    expect(sesion.propuesta).toBeNull();
    expect(sesion.equipo?.objetivo).toContain("fecha, cliente y total");
    expect(sesion.equipo?.fin?.rama).toMatch(/^dolphin-equipo\//);
  }, 120_000);

  it("se puede configurar por proyecto: en modo charla no arma equipos", async () => {
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ terminal: { modo: "charla" } }));
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false, pensar: pensadorQue({ tipo: "tarea", tarea: "algo" }) });
    await sesion.recibir("hacé algo");
    expect(sesion.mensajes.at(-1)?.texto).toContain("modo charla");
    expect(sesion.trabajo).toBeNull();
  });

  it("sin repo, un proyecto crea su carpeta con git, la suma a tus proyectos y vuelve para abrirla", async () => {
    const hogar = await mkdtemp(join(tmpdir(), "dolphin-hogar-"));
    const antes = process.env.DOLPHIN_HOME;
    process.env.DOLPHIN_HOME = hogar;
    try {
      const sesion = new Sesion({
        repo,
        agente: "mentira",
        automatico: false,
        sinRepo: true,
        pensar: pensadorQue({ tipo: "proyecto", resumen: "turnos", prompt: "Una app de turnos.", preguntas: ["¿Para quién?"], carpeta: "turnos" }),
      });
      await sesion.recibir("armame una app de turnos");
      const siguiente = await sesion.recibir("dale");
      const ruta = join(repo, "turnos");
      expect(siguiente).toEqual({ abrir: ruta, despues: "Una app de turnos." });
      expect((await stat(join(ruta, ".git"))).isDirectory()).toBe(true);
      expect((await leerProyectos(hogar)).map((p) => p.ruta)).toContain(ruta);
    } finally {
      if (antes === undefined) delete process.env.DOLPHIN_HOME;
      else process.env.DOLPHIN_HOME = antes;
      await borrarCarpeta(hogar);
    }
  });
});
