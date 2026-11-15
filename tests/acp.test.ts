import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { correrAgenteAcp } from "../src/agentes/acp.js";
import { prepararSiembra, sembrarTarea } from "../src/siembra.js";

const correr = promisify(execFile);

/**
 * El cliente de ACP, contra un agente que habla el protocolo de verdad.
 *
 * El agente es de mentira (tests/fixtures/agente-acp.mjs) pero el protocolo no: JSON-RPC por
 * líneas, apretón de manos, sesión, permisos y los pedidos de archivo que hace el agente. Así se
 * prueba el cliente entero sin gastar un centavo ni depender de que haya un CLI instalado.
 */

const AGENTE = fileURLToPath(new URL("./fixtures/agente-acp.mjs", import.meta.url));

describe("hablar ACP con un agente de afuera", () => {
  let repo = "";
  const correr = (pedido: string, tope = 30_000) =>
    correrAgenteAcp(pedido, { cmd: process.execPath, args: [AGENTE], cwd: repo, tope });

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-acp-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("hace el apretón de manos, abre la sesión y trae lo que dijo el agente, pegado", async () => {
    const t = await correr("contame algo");
    expect(t.porQueParo).toBe("end_turn");
    // Lo dijo en dos trozos: el cliente los junta en un texto, no en dos.
    expect(t.texto).toBe("Listo, terminé.");
  });

  it("el agente escribe en el worktree con fs/write_text_file", async () => {
    await correr("escribí src/nuevo.ts");
    expect(await readFile(join(repo, "src", "nuevo.ts"), "utf8")).toContain("hecho por el agente de mentira");
  });

  it("y lee de él con fs/read_text_file", async () => {
    await writeFile(join(repo, "ya-estaba.txt"), "el contenido de antes");
    const t = await correr("leé ya-estaba.txt");
    expect(t.texto).toContain("leí: el contenido de antes");
  });

  it("no lo deja escribir fuera de la carpeta de su rama", async () => {
    const t = await correr("escapate");
    expect(t.texto).toContain("no me dejó");
    expect(t.texto).toContain("queda fuera de la carpeta de esta rama");
    // Y de verdad no escribió: esto es lo que importa, no el mensaje.
    expect(existsSync(join(repo, "..", "afuera.txt"))).toBe(false);
  });

  it("no le ofrece la terminal: lo que no se anuncia, no se concede", async () => {
    const t = await correr("probá la terminal");
    expect(t.texto).toContain("sin terminal");
    expect(t.texto).toContain("no implementa «terminal/create»");
  });

  it("le da permiso solo, y elige la opción que permite y no la primera de la lista", async () => {
    const t = await correr("sin permiso, hacelo");
    expect(t.texto).toContain('"outcome":"selected"');
    expect(t.texto).toContain('"optionId":"dale"');
  });

  it("trae el plan del agente, con el estado de cada paso", async () => {
    const vistos: unknown[] = [];
    const t = await correrAgenteAcp("planificá y hacelo", { cmd: process.execPath, args: [AGENTE], cwd: repo, tope: 30_000, alPlanear: (p) => vistos.push(p) });
    expect(t.plan.map((p) => [p.texto, p.estado])).toEqual([
      ["mirar el repo", "completed"],
      ["escribir el cambio", "in_progress"],
      ["probarlo", "pending"],
    ]);
    expect(vistos).toHaveLength(1);
  });

  it("anota cada herramienta que usa, con su estado final", async () => {
    const t = await correr("escribí a.txt");
    expect(t.herramientas).toEqual([{ id: "call_escribir", titulo: "Escribiendo a.txt", tipo: "edit", estado: "completed" }]);
  });

  it("cuando el agente dice cuánto gastó, se usa: es lo que los CLI nunca dicen", async () => {
    const t = await correr("gasté algo");
    expect(t.gastado).toBe(0.045);
    expect(t.contexto).toEqual({ usado: 53_000, tamano: 200_000 });
  });

  it("una línea que no es del protocolo no rompe la corrida", async () => {
    const t = await correr("escribí a.txt y mandá basura");
    expect(t.porQueParo).toBe("end_turn");
    expect(await readFile(join(repo, "a.txt"), "utf8")).toContain("mentira");
  });

  it("si el agente se niega, se sabe por qué paró", async () => {
    expect((await correr("negate")).porQueParo).toBe("refusal");
  });

  it("va contando lo que dice mientras trabaja, no al final", async () => {
    const trozos: string[] = [];
    await correrAgenteAcp("contame", { cmd: process.execPath, args: [AGENTE], cwd: repo, tope: 30_000, alDecir: (t) => trozos.push(t) });
    expect(trozos).toEqual(["Listo", ", terminé."]);
  });

  it("un comando que no existe se dice en castellano y no se cuenta como gasto", async () => {
    await expect(correrAgenteAcp("hola", { cmd: "no-existe-este-agente-acp", cwd: repo })).rejects.toThrow(/no encontré/);
  });

  it("un agente que habla otra versión del protocolo se corta ahí, no después", async () => {
    await expect(
      correrAgenteAcp("hola", { cmd: process.execPath, args: [AGENTE], cwd: repo, tope: 30_000, entorno: { ACP_DE_MENTIRA: "version-rara" } }),
    ).rejects.toThrow(/habla la versión 99 de ACP/);
  });

  it("un agente sin sesión iniciada lo dice con lo que hay que hacer, no con «error -32000»", async () => {
    await expect(
      correrAgenteAcp("hola", { cmd: process.execPath, args: [AGENTE], cwd: repo, tope: 30_000, entorno: { ACP_DE_MENTIRA: "sin-login" } }),
    ).rejects.toThrow(/pide que te loguees primero/);
  });

  it("se puede cortar desde afuera sin dejar el proceso colgado", async () => {
    const corte = new AbortController();
    const promesa = correrAgenteAcp("contame", { cmd: process.execPath, args: [AGENTE], cwd: repo, tope: 30_000, senal: corte.signal });
    corte.abort();
    await expect(promesa).rejects.toThrow();
  });

  it("si el agente sabe retomar, la segunda vuelta sigue la misma conversación", async () => {
    const conRetomar = { cmd: process.execPath, args: [AGENTE], cwd: repo, tope: 30_000, entorno: { ACP_DE_MENTIRA: "retoma" } };
    const primera = await correrAgenteAcp("contame", conRetomar);
    expect(primera.sesion).toBe("sess_1");

    const segunda = await correrAgenteAcp("seguí con eso", { ...conRetomar, sesionPrevia: primera.sesion });
    // La misma sesión, no una nueva: no volvió a pagar para que el agente entienda el repo. Si
    // hubiera abierto una, el agente de mentira la habría numerado sess_2.
    expect(segunda.sesion).toBe("sess_1");
    // Y lo que el agente reenvía del historial al cargar no se cuenta como dicho en este turno.
    expect(segunda.texto).not.toContain("ESTO ES DEL HISTORIAL");
    expect(segunda.texto).toBe("Listo, terminé.");
  });

  it("si el agente no sabe retomar, se abre una sesión nueva sin hacer ruido", async () => {
    const t = await correrAgenteAcp("seguí", { cmd: process.execPath, args: [AGENTE], cwd: repo, tope: 30_000, sesionPrevia: "sess_vieja" });
    expect(t.sesion).toBe("sess_1");
    expect(t.porQueParo).toBe("end_turn");
  });

  it("una sesión que el agente ya no tiene no es un error: abre una nueva", async () => {
    const t = await correrAgenteAcp("seguí", {
      cmd: process.execPath,
      args: [AGENTE],
      cwd: repo,
      tope: 30_000,
      entorno: { ACP_DE_MENTIRA: "retoma" },
      sesionPrevia: "sesion-que-ya-no-esta",
    });
    expect(t.sesion).toBe("sess_1");
    expect(t.porQueParo).toBe("end_turn");
  });

  it("el agente de mentira vive en fixtures y no se instala nada para probarlo", () => {
    expect(existsSync(AGENTE)).toBe(true);
    expect(dirname(AGENTE).endsWith("fixtures")).toBe(true);
  });
});

/** Y el camino entero: una siembra de verdad con `--agente acp`, con su worktree y su portón. */
describe("sembrar con un agente ACP", () => {
  let repo = "";
  const git = (args: readonly string[]) => correr("git", [...args], { cwd: repo, windowsHide: true });

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-acp-siembra-"));
    await writeFile(join(repo, "package.json"), `${JSON.stringify({ name: "t", scripts: { test: 'node -e "process.exit(0)"' } }, null, 2)}\n`);
    await writeFile(
      join(repo, "dolphin.config.json"),
      `${JSON.stringify({ acp: { cmd: process.execPath, args: [AGENTE] } }, null, 2)}\n`,
    );
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await git(args);
    }
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("el agente escribe en su rama y la rama cruza el portón", async () => {
    const pedido = { repo, tarea: "escribí src/hecho.txt con lo que haga falta", agente: "acp" as const };
    const preparada = await prepararSiembra(pedido);
    expect(preparada.agente.nombre).toContain("acp:");
    const { cosecha } = await sembrarTarea(pedido, preparada, { cantidad: 1, limpiar: false });
    const ganador = cosecha.ganador;
    expect(ganador?.vivo).toBe(true);
    expect(await readFile(join(ganador!.universo.ruta, "src", "hecho.txt"), "utf8")).toContain("mentira");
    // Este agente no informa costo, así que queda desconocido y no en cero: un cero lo haría pasar por gratis.
    expect(ganador?.costoDesconocido ?? false).toBe(true);
  }, 120_000);

  it("sin el comando en dolphin.config.json lo dice en castellano, en vez de fallar raro", async () => {
    await writeFile(join(repo, "dolphin.config.json"), "{}\n");
    await expect(prepararSiembra({ repo, tarea: "hacé algo", agente: "acp" })).rejects.toThrow(/con qué comando se lanza/);
  }, 60_000);
});
