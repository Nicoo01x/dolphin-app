import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buscarMemorias,
  carpetaDeClaudeCode,
  carpetaDeGemini,
  marcasDelProyecto,
  mensajesDeClaudeCode,
  mensajesDeCodex,
  MENCIONES_MINIMAS,
} from "../src/nucleo/buscar-memorias.js";
import {
  contextoDeEntrenamiento,
  destilar,
  entrenar,
  leerEntrenamiento,
  leerVerdades,
  olvidarAprendido,
  promptDeDestilar,
  TOPE_POR_FUENTE,
  TOPE_TOTAL,
  type Destilador,
} from "../src/nucleo/entrenar.js";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { contextoDeSiembra } from "../src/nucleo/perfil.js";
import { correrConPrompt } from "../src/agentes/ejecutar.js";
import { crearServidor } from "../src/servidor.js";

/**
 * Entrenar al delfín: encontrar TODO lo que el proyecto ya les enseñó a otros
 * modelos —también lo que vive en ~/.claude, ~/.codex y ~/.gemini— y que
 * llegue a todos, destilado y sin repetirle a cada motor lo que ya lee solo.
 */

let repo = "";
let casa = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-entrenar-app-"));
  casa = await mkdtemp(join(tmpdir(), "dolphin-casa-"));
});

afterEach(async () => {
  await borrarCarpeta(repo);
  await borrarCarpeta(casa);
});

async function escribir(ruta: string, texto: string) {
  await mkdir(join(ruta, ".."), { recursive: true });
  await writeFile(ruta, texto);
}

/** Una conversación de Claude Code con el formato real: lo de la persona, y todo lo que NO es de ella. */
function conversacionDeClaude(repoMencionado: string, veces: number): string {
  const ruido = Array.from({ length: veces }, () =>
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: `Leo ${repoMencionado}/src` }] } }),
  );
  return [
    JSON.stringify({ type: "user", message: { role: "user", content: "los importes van con coma decimal" }, timestamp: "2026-10-20T10:00:00Z" }),
    JSON.stringify({ type: "user", isMeta: true, message: { role: "user", content: "Base directory for this skill: x" } }),
    JSON.stringify({ type: "user", message: { role: "user", content: "<task-notification>\n<task-id>b1</task-id>" } }),
    JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "salida de una herramienta" }] } }),
    JSON.stringify({ type: "queue-operation", operation: "enqueue", content: "nada de emojis en la interfaz", timestamp: "2026-10-20T11:00:00Z" }),
    JSON.stringify({ type: "queue-operation", operation: "remove", content: "nada de emojis en la interfaz" }),
    ...ruido,
  ].join("\n");
}

describe("el buscador de memorias", () => {
  it("encuentra las instrucciones de cada herramienta en el repo, archivos y carpetas", async () => {
    await escribir(join(repo, "CLAUDE.md"), "# Reglas\n- usá pnpm\n- nada de any\n");
    await escribir(join(repo, "AGENTS.md"), "- los tests van en tests/\n");
    await escribir(join(repo, ".github", "copilot-instructions.md"), "- español rioplatense\n");
    await escribir(join(repo, ".cursor", "rules", "estilo.mdc"), "- sin punto y coma\n");
    await escribir(join(repo, ".kiro", "steering", "producto.md"), "- es una app de facturación\n");
    await escribir(join(repo, "GEMINI.md"), "   \n");
    const { fuentes } = await buscarMemorias(repo, casa);
    expect(fuentes.map((f) => f.nombre)).toEqual([
      "CLAUDE.md",
      "AGENTS.md",
      ".github/copilot-instructions.md",
      "Reglas de Cursor",
      "Guías de Kiro",
    ]);
    expect(fuentes.find((f) => f.nombre === "CLAUDE.md")?.lineas).toBe(3);
  });

  it("trae las instrucciones globales de Claude, Codex y Gemini", async () => {
    await escribir(join(casa, ".claude", "CLAUDE.md"), "- botones con feedback\n");
    await escribir(join(casa, ".codex", "AGENTS.md"), "- respondé en castellano\n");
    await escribir(join(casa, ".gemini", "GEMINI.md"), "");
    const { fuentes } = await buscarMemorias(repo, casa);
    expect(fuentes.map((f) => [f.nombre, f.alcance])).toEqual([
      ["Tus instrucciones globales de Claude", "global"],
      ["Tus instrucciones globales de Codex", "global"],
    ]);
  });

  it("la memoria de Claude Code: la de este proyecto entera, y de otros solo lo que habla de este", async () => {
    const propia = join(carpetaDeClaudeCode(repo, casa), "memory");
    await escribir(join(propia, "MEMORY.md"), "- [El deploy](deploy.md)\n");
    await escribir(join(propia, "deploy.md"), "El deploy es por tar.\n");
    const otra = join(casa, ".claude", "projects", "D--otro-proyecto", "memory");
    await escribir(join(otra, "MEMORY.md"), `- algo de ${repo}\n`);
    await escribir(join(otra, "sobre-este.md"), `Este archivo habla de ${repo} y de cómo se prueba.\n`);
    await escribir(join(otra, "de-otra-cosa.md"), "Nada que ver.\n");
    // La carpeta «D--otro-proyecto» no dice si era «otro-proyecto» u «otro/proyecto»: lo dice el cwd de su conversación.
    await escribir(
      join(otra, "..", "sesion.jsonl"),
      JSON.stringify({ type: "user", cwd: "D:\\otro-proyecto", message: { role: "user", content: "hola" } }),
    );

    const { fuentes } = await buscarMemorias(repo, casa);
    const memorias = fuentes.filter((f) => f.tipo === "memoria");
    expect(memorias.map((f) => [f.nombre, f.archivos, f.proyecto])).toEqual([
      ["Memoria de Claude Code", 2, undefined],
      ["Memoria de Claude Code de «otro-proyecto»", 1, "otro-proyecto"],
    ]);
    // El índice de OTRO proyecto es de él, aunque nombre a este.
    expect(memorias[1]!.rutas.some((r) => r.endsWith("MEMORY.md"))).toBe(false);
  });

  it("de las conversaciones de Claude Code toma solo lo que escribió la persona", () => {
    const mensajes = mensajesDeClaudeCode(conversacionDeClaude("/x/mi-repo", 0));
    expect(mensajes.map((m) => m.texto)).toEqual(["los importes van con coma decimal", "nada de emojis en la interfaz"]);
  });

  it("lee las conversaciones de Claude Code que hablan del proyecto, en cualquier carpeta, y no las de subagentes", async () => {
    const otra = join(casa, ".claude", "projects", "C--desde-otra-carpeta");
    await escribir(join(otra, "sobre-este.jsonl"), conversacionDeClaude(repo, MENCIONES_MINIMAS));
    await escribir(join(otra, "lo-nombra-poco.jsonl"), conversacionDeClaude(repo, 1));
    await escribir(join(otra, "subagents", "agente.jsonl"), conversacionDeClaude(repo, MENCIONES_MINIMAS * 2));
    const hallazgo = await buscarMemorias(repo, casa);
    const conversaciones = hallazgo.fuentes.find((f) => f.tipo === "conversaciones");
    expect(conversaciones?.archivos).toBe(1);
    expect(hallazgo.mensajes.map((m) => m.texto)).toEqual(["los importes van con coma decimal", "nada de emojis en la interfaz"]);
  });

  it("lee las sesiones de Codex que corrieron en el repo y el registro de Gemini del proyecto", async () => {
    const sesion = [
      JSON.stringify({ type: "session_meta", payload: { cwd: repo } }),
      JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>\n<cwd>x</cwd>" }] } }),
      JSON.stringify({ type: "response_item", timestamp: "2026-10-01T09:00:00Z", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "el CUIT va sin guiones" }] } }),
      JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Listo" }] } }),
    ].join("\n");
    await escribir(join(casa, ".codex", "sessions", "2026", "10", "01", "rollout-1.jsonl"), sesion);
    await escribir(join(casa, ".codex", "sessions", "2026", "10", "01", "rollout-2.jsonl"), sesion.replace(JSON.stringify(repo).slice(1, -1), "C:/otro"));
    await escribir(
      join(carpetaDeGemini(repo, casa), "logs.json"),
      JSON.stringify([
        { type: "user", message: "las fechas van dd/mm/aaaa", timestamp: "2026-10-02T09:00:00Z" },
        { type: "user", message: "/chat save" },
      ]),
    );
    const hallazgo = await buscarMemorias(repo, casa);
    expect(hallazgo.fuentes.filter((f) => f.tipo === "conversaciones").map((f) => [f.nombre, f.archivos])).toEqual([
      ["Conversaciones con Codex", 1],
      ["Conversaciones con Gemini", 1],
    ]);
    expect(hallazgo.mensajes.map((m) => m.texto)).toEqual(["el CUIT va sin guiones", "las fechas van dd/mm/aaaa"]);
    expect(mensajesDeCodex(sesion).cwd).toBe(repo);
  });

  it("un nombre de carpeta genérico no cuenta como mención: solo la ruta", () => {
    expect(marcasDelProyecto("D:/proyectos/app")).not.toContain("app");
    expect(marcasDelProyecto("D:/proyectos/dolphin-app")).toContain("dolphin-app");
  });
});

describe("entrenar y destilar", () => {
  it("anota de dónde leer en .dolphin y buscar de nuevo no borra lo aprendido", async () => {
    await escribir(join(repo, "CLAUDE.md"), "- usá pnpm\n");
    expect(await leerEntrenamiento(repo)).toBeNull();
    const hecho = await entrenar(repo, casa, new Date("2026-10-22T12:00:00Z"));
    expect(hecho.fuentes).toHaveLength(1);
    expect(await leerEntrenamiento(repo)).toEqual(hecho);

    await destilar(repo, async () => ({ texto: '{"verdades":[{"texto":"Usá pnpm.","fuente":"CLAUDE.md"}]}', gastado: 0.01 }), casa);
    const otraVez = await entrenar(repo, casa);
    expect(otraVez.aprendido).toEqual([{ texto: "Usá pnpm.", fuente: "CLAUDE.md" }]);
  });

  it("el destilador recibe las instrucciones y lo que dijo la persona, y lo aprendido queda con su fuente", async () => {
    await escribir(join(repo, "AGENTS.md"), "- los tests van en tests/\n");
    const otra = join(casa, ".claude", "projects", "C--otra");
    await escribir(join(otra, "s.jsonl"), conversacionDeClaude(repo, MENCIONES_MINIMAS));
    let pedido = "";
    const destilador: Destilador = async (prompt) => {
      pedido = prompt;
      return {
        texto: JSON.stringify({
          verdades: [
            { texto: "Los importes van con coma decimal.", fuente: "Conversaciones con Claude Code" },
            { texto: "Los tests van en tests/.", fuente: "AGENTS" },
            { texto: "La clave es password: hunter2", fuente: "AGENTS.md" },
            { texto: "Los importes van con coma decimal.", fuente: "AGENTS.md" },
          ],
        }),
        gastado: 0.02,
      };
    };
    const hecho = await destilar(repo, destilador, casa);
    expect(pedido).toContain("los tests van en tests/");
    expect(pedido).toContain("los importes van con coma decimal");
    expect(pedido).not.toContain("salida de una herramienta");
    // Repetidas afuera, secretos afuera, la fuente abreviada se resuelve a la de verdad.
    expect(hecho.aprendido).toEqual([
      { texto: "Los importes van con coma decimal.", fuente: "Conversaciones con Claude Code" },
      { texto: "Los tests van en tests/.", fuente: "AGENTS.md" },
    ]);
    expect(hecho.destilado?.gastado).toBe(0.02);
  });

  it("cortado antes de destilar no le pide nada al modelo, y la señal le llega al destilador", async () => {
    await escribir(join(repo, "CLAUDE.md"), "- usá pnpm\n");
    let llamado = false;
    const corte = new AbortController();
    corte.abort();
    await expect(destilar(repo, async () => ((llamado = true), { texto: "{}", gastado: 0 }), casa, new Date(), corte.signal)).rejects.toThrow(/cancelado/);
    expect(llamado).toBe(false);

    const vivo = new AbortController();
    let recibida: AbortSignal | undefined;
    await destilar(repo, async (_p, _r, senal) => ((recibida = senal), { texto: '{"verdades":[]}', gastado: 0 }), casa, new Date(), vivo.signal);
    expect(recibida).toBe(vivo.signal);
  });

  it("cortar la señal mata el proceso del modelo en vez de esperarlo", async () => {
    const corte = new AbortController();
    const inicio = Date.now();
    // Un «modelo» que no contesta nunca: sin el corte, esperaría al tope de 60 s.
    const corrida = correrConPrompt(process.execPath, ["-e", "setInterval(() => {}, 1000)"], "", repo, 60_000, undefined, false, undefined, corte.signal);
    setTimeout(() => corte.abort(), 300);
    await expect(corrida).rejects.toThrow(/cancelado/);
    expect(Date.now() - inicio).toBeLessThan(15_000);
  });

  it("sin nada que leer no llama al destilador", async () => {
    let llamado = false;
    const hecho = await destilar(repo, async () => ((llamado = true), { texto: "{}", gastado: 0 }), casa);
    expect(llamado).toBe(false);
    expect(hecho.aprendido).toEqual([]);
  });

  it("una respuesta sin JSON es un error con su porqué", () => {
    expect(() => leerVerdades("no sé", [])).toThrow("no contestó un JSON");
  });

  it("los mensajes más nuevos entran primero si no entran todos", async () => {
    const mensajes = Array.from({ length: 2_000 }, (_, i) => ({ de: "claude" as const, texto: `mensaje número ${i} ${"x".repeat(40)}`, cuando: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}` }));
    const prompt = await promptDeDestilar([], mensajes);
    expect(prompt).toContain("mensaje número 1999");
    expect(prompt).not.toContain("mensaje número 0 ");
  });

  it("se puede tachar una verdad aprendida", async () => {
    await escribir(join(repo, "CLAUDE.md"), "- usá pnpm\n");
    await destilar(
      repo,
      async () => ({ texto: '{"verdades":[{"texto":"Usá pnpm.","fuente":"CLAUDE.md"},{"texto":"Nada de any.","fuente":"CLAUDE.md"}]}', gastado: 0 }),
      casa,
    );
    const quedo = await olvidarAprendido(repo, "Usá pnpm.");
    expect(quedo?.aprendido?.map((a) => a.texto)).toEqual(["Nada de any."]);
  });
});

describe("lo que viaja a cada siembra", () => {
  it("a cada motor le llega lo que no lee solo, leído fresco, con lo destilado primero", async () => {
    await escribir(join(repo, "CLAUDE.md"), "- usá pnpm\n");
    await escribir(join(repo, "AGENTS.md"), "- los tests van en tests/\n");
    await destilar(repo, async () => ({ texto: '{"verdades":[{"texto":"Nunca deployes un viernes.","fuente":"CLAUDE.md"}]}', gastado: 0 }), casa);

    const aClaude = await contextoDeEntrenamiento(repo, "claude");
    expect(aClaude).not.toContain("usá pnpm");
    expect(aClaude).toContain("los tests van en tests/");
    expect(aClaude.indexOf("Nunca deployes un viernes")).toBeLessThan(aClaude.indexOf("los tests van"));

    const aCodex = await contextoDeEntrenamiento(repo, "codex");
    expect(aCodex).toContain("usá pnpm");
    expect(aCodex).not.toContain("los tests van en tests/");

    await escribir(join(repo, "CLAUDE.md"), "- usá bun\n");
    expect(await contextoDeEntrenamiento(repo, "codex")).toContain("usá bun");
  });

  it("la memoria de Claude Code le llega también a Claude, y las conversaciones nunca enteras", async () => {
    const memoria = join(carpetaDeClaudeCode(repo, casa), "memory");
    await escribir(join(memoria, "MEMORY.md"), "- el VPS no es un repo git\n");
    await escribir(join(casa, ".claude", "projects", "C--x", "s.jsonl"), conversacionDeClaude(repo, MENCIONES_MINIMAS));
    await entrenar(repo, casa);
    const aClaude = await contextoDeEntrenamiento(repo, "claude");
    expect(aClaude).toContain("el VPS no es un repo git");
    expect(aClaude).not.toContain("los importes van con coma decimal");
  });

  it("recorta cada fuente y el total, diciendo dónde sigue", async () => {
    for (const archivo of ["AGENTS.md", "GEMINI.md", ".windsurfrules", "CONVENTIONS.md", ".cursorrules"]) {
      await escribir(join(repo, archivo), "x".repeat(TOPE_POR_FUENTE * 3));
    }
    await entrenar(repo, casa);
    const texto = await contextoDeEntrenamiento(repo, "claude");
    expect(texto).toContain("[…sigue en AGENTS.md]");
    expect(texto.length).toBeLessThan(TOPE_TOTAL + 1_000);
  });

  it("sin entrenar, o sin memorias, no suma nada al prompt", async () => {
    expect(await contextoDeEntrenamiento(repo, "codex")).toBe("");
    await entrenar(repo, casa);
    expect(await contextoDeEntrenamiento(repo, "codex")).toBe("");
  });

  it("viaja en el contexto de la siembra, después del perfil y la memoria", async () => {
    await escribir(join(repo, "CLAUDE.md"), "- usá pnpm\n");
    await escribir(join(repo, ".dolphin", "PERFIL.md"), "- hay particulares Y empresas\n");
    await entrenar(repo, casa);
    const contexto = await contextoDeSiembra(repo, "una tarea", "", "codex");
    expect(contexto.indexOf("hay particulares")).toBeLessThan(contexto.indexOf("usá pnpm"));
  });
});

describe("entrenar desde la consola", () => {
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";

  beforeEach(async () => {
    servidor = crearServidor({ repo, calendario: false, casa, destilador: async () => ({ texto: '{"verdades":[{"texto":"Los tests van en tests/.","fuente":"AGENTS.md"}]}', gastado: 0 }) });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
  });

  const pase = async (): Promise<string | undefined> => {
    const pagina = await (await fetch(`${base}/`)).text();
    return /name="dolphin-token" content="([0-9a-f]+)"/.exec(pagina)?.[1];
  };

  const mandar = async (cuerpo: unknown) => {
    const token = await pase();
    return fetch(`${base}/api/entrenamiento`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-dolphin-token": token } : {}) },
      body: JSON.stringify(cuerpo),
    });
  };

  it("si la consola corta el pedido de destilar, el destilador recibe el corte", async () => {
    await escribir(join(repo, "AGENTS.md"), "- los tests van en tests/\n");
    let cortado: () => void = () => {};
    const llegoElCorte = new Promise<void>((listo) => (cortado = listo));
    const lento = crearServidor({
      repo,
      calendario: false,
      casa,
      // Un modelo que tarda: solo termina si le llega el corte.
      destilador: (_p, _r, senal) =>
        new Promise((_, rechazar) =>
          senal?.addEventListener("abort", () => {
            cortado();
            rechazar(new Error("cancelado"));
          }),
        ),
    });
    await new Promise<void>((listo) => lento.listen(0, "127.0.0.1", listo));
    const url = `http://127.0.0.1:${(lento.address() as { port: number }).port}`;
    try {
      const token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${url}/`)).text())?.[1] ?? "";
      const corte = new AbortController();
      const pedido = fetch(`${url}/api/entrenamiento`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-dolphin-token": token },
        body: JSON.stringify({ accion: "destilar" }),
        signal: corte.signal,
      }).catch(() => null);
      setTimeout(() => corte.abort(), 200);
      await pedido;
      await llegoElCorte;
    } finally {
      lento.closeAllConnections();
      await new Promise((listo) => lento.close(listo));
    }
  });

  it("buscar, destilar y tachar, cada uno con su respuesta", async () => {
    await escribir(join(repo, "AGENTS.md"), "- los tests van en tests/\n");
    expect(await (await fetch(`${base}/api/entrenamiento`)).json()).toEqual({ entrenamiento: null });

    const buscado = (await (await mandar({ accion: "buscar" })).json()) as { entrenamiento: { fuentes: { nombre: string }[] } };
    expect(buscado.entrenamiento.fuentes.map((f) => f.nombre)).toEqual(["AGENTS.md"]);

    const destilado = (await (await mandar({ accion: "destilar" })).json()) as { entrenamiento: { aprendido: { texto: string }[] } };
    expect(destilado.entrenamiento.aprendido.map((a) => a.texto)).toEqual(["Los tests van en tests/."]);

    const tachado = (await (await mandar({ accion: "olvidar", texto: "Los tests van en tests/." })).json()) as { entrenamiento: { aprendido: unknown[] } };
    expect(tachado.entrenamiento.aprendido).toEqual([]);
  });

  it("sin el pase de la consola no entrena", async () => {
    const r = await fetch(`${base}/api/entrenamiento`, { method: "POST", body: "{}" });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await leerEntrenamiento(repo)).toBeNull();
  });
});
