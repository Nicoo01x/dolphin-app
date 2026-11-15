import { describe, expect, it } from "vitest";
import { argumentosDeClaude, leerSalida } from "../src/agentes/claude.js";
import { argumentosDeLectura } from "../src/agentes/leer-con-claude.js";
import { decirVoz, escucharVoces, herramientaEnUnaLinea, oyenteDeClaude, vocesDeClaude, type Voz } from "../src/nucleo/voces.js";
import { Bufer } from "../src/tui/celdas.js";
import { bicho, mascotaDe, pintarMascota } from "../src/tui/mascotas.js";

/**
 * La terminal en vivo de cada agente: lo que dice Claude por stream-json se vuelve voces («Edit
 * src/a.ts», «Bash: npm test»), y el resultado con el costo se sigue leyendo de la última línea.
 */

const STREAM = [
  '{"type":"system","subtype":"init","session_id":"s1"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Miro el botón.\\nDespués lo cambio."},{"type":"tool_use","name":"Edit","input":{"file_path":"C:\\\\repo\\\\src\\\\ui\\\\boton.tsx"}}]}}',
  '{"type":"user","message":{"content":[{"type":"tool_result","content":"The file has been updated.\\nmás","is_error":false}]}}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"npm test -- boton"}}]}}',
  '{"type":"user","message":{"content":[{"type":"tool_result","content":[{"type":"text","text":"1 failed"}],"is_error":true}]}}',
  '{"type":"result","subtype":"success","is_error":false,"result":"listo","total_cost_usd":0.0123,"session_id":"s1"}',
].join("\n");

describe("las voces de Claude", () => {
  it("cada línea del stream se vuelve lo que una persona entiende", () => {
    const nombres = new Map<string, string>();
    const voces = STREAM.split("\n").flatMap((l) => vocesDeClaude(l, nombres));
    expect(voces).toEqual([
      { tipo: "texto", texto: "Miro el botón." },
      { tipo: "texto", texto: "Después lo cambio." },
      { tipo: "herramienta", texto: "Edit src/ui/boton.tsx" },
      // Sin el id de la herramienta no se sabe de cuál era: va el texto, hasta 4 renglones.
      { tipo: "resultado", texto: "The file has been updated.\nmás" },
      { tipo: "herramienta", texto: "Bash: npm test -- boton" },
      { tipo: "error", texto: "1 failed" },
    ]);
    expect(vocesDeClaude("no es json")).toEqual([]);
    expect(herramientaEnUnaLinea("Grep", { pattern: "TODO" })).toBe("Grep «TODO»");
  });

  it("debajo de cada herramienta, lo que muestra Claude Code: el diff, las tareas, lo leído y lo que piensa", () => {
    const nombres = new Map<string, string>();
    const linea = (tipo: string, contenido: unknown[]) => JSON.stringify({ type: tipo, message: { content: contenido } });
    const voces = [
      linea("assistant", [{ type: "thinking", thinking: "Conviene leer antes de tocar." }]),
      linea("assistant", [{ type: "tool_use", id: "r1", name: "Read", input: { file_path: "src/a.ts" } }]),
      linea("user", [{ type: "tool_result", tool_use_id: "r1", content: "uno\ndos\ntres" }]),
      linea("assistant", [{ type: "tool_use", id: "e1", name: "Edit", input: { file_path: "src/a.ts", old_string: "const a = 1\nconst b = 2", new_string: "const a = 1\nconst b = 3" } }]),
      linea("user", [{ type: "tool_result", tool_use_id: "e1", content: "The file has been updated." }]),
      linea("assistant", [{ type: "tool_use", id: "t1", name: "TodoWrite", input: { todos: [{ content: "Leer", status: "completed" }, { content: "Editar", status: "in_progress" }, { content: "Probar", status: "pending" }] } }]),
      linea("assistant", [{ type: "tool_use", id: "b1", name: "Bash", input: { command: "npm test" } }]),
      linea("user", [{ type: "tool_result", tool_use_id: "b1", content: "1\n2\n3\n4\n5\n6" }]),
    ].flatMap((l) => vocesDeClaude(l, nombres));
    expect(voces).toEqual([
      { tipo: "pensando", texto: "Conviene leer antes de tocar." },
      { tipo: "herramienta", texto: "Read src/a.ts", ref: "r1" },
      { tipo: "resultado", texto: "Leyó 3 renglones", ref: "r1" },
      { tipo: "herramienta", texto: "Edit src/a.ts", ref: "e1" },
      // Lo que no cambió va una vez como contexto; el «se actualizó» sobra, el diff ya lo dice.
      { tipo: "diff", texto: "1 agregado, 1 quitado\n  const a = 1\n- const b = 2\n+ const b = 3", ref: "e1" },
      { tipo: "listo", texto: "ok", ref: "e1" },
      { tipo: "herramienta", texto: "TodoWrite", ref: "t1" },
      { tipo: "tareas", texto: "[x] Leer\n[~] Editar\n[ ] Probar", ref: "t1" },
      { tipo: "herramienta", texto: "Bash: npm test", ref: "b1" },
      { tipo: "resultado", texto: "1\n2\n3\n4\n… +2 renglones", ref: "b1" },
    ]);
    // Cada id se olvida al llegar su resultado: la memoria no crece con la sesión.
    expect([...nombres.keys()]).toEqual(["t1"]);
  });

  it("los bordes: el \\n final de un Write, un Glob vacío y un null en la lista no tumban nada", () => {
    const nombres = new Map<string, string>();
    const usar = (id: string, name: string, input: unknown) => vocesDeClaude(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } }), nombres);
    const devolver = (id: string, content: string) => vocesDeClaude(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content }] } }), nombres);
    expect(usar("w", "Write", { file_path: "a.txt", content: "uno\r\ndos\r\n" })[1]).toEqual({ tipo: "diff", texto: "2 agregados, 0 quitados\n+ uno\n+ dos", ref: "w" });
    usar("g", "Glob", { pattern: "*.zz" });
    expect(devolver("g", "No files found")).toEqual([{ tipo: "resultado", texto: "Ningún archivo", ref: "g" }]);
    expect(() => usar("m", "MultiEdit", { file_path: "a", edits: [null, { old_string: "a", new_string: "b" }] })).not.toThrow();
    expect(usar("t", "TodoWrite", { todos: [null, { content: "x", status: "pending" }] })[1]).toEqual({ tipo: "tareas", texto: "[ ] x", ref: "t" });
    expect(usar("m2", "MultiEdit", { file_path: "a", edits: [{ old_string: "a", new_string: "b" }, { old_string: "c", new_string: "d" }] })[1]!.texto).toBe("2 agregados, 2 quitados\n- a\n+ b\n  ⋯\n- c\n+ d");
    expect(vocesDeClaude("null")).toEqual([]);
  });

  it("el resultado con el costo se lee igual que antes, aunque venga en stream", () => {
    expect(leerSalida(STREAM)).toMatchObject({ result: "listo", total_cost_usd: 0.0123, session_id: "s1" });
    // Y la salida vieja, de un solo JSON, sigue sirviendo.
    expect(leerSalida('{"result":"ok","total_cost_usd":0.5}')).toMatchObject({ result: "ok", total_cost_usd: 0.5 });
  });

  it("los agentes piden stream-json; el lector, solo si alguien mira", () => {
    expect(argumentosDeClaude({})).toEqual(expect.arrayContaining(["--output-format", "stream-json", "--verbose"]));
    expect(argumentosDeLectura({ vueltas: 1, herramientas: ["Read"] })).toEqual(expect.arrayContaining(["--output-format", "json"]));
    expect(argumentosDeLectura({ vueltas: 1, herramientas: ["Read"], voz: "lider:x" })).toEqual(expect.arrayContaining(["stream-json", "--verbose"]));
  });

  it("el oyente junta los trozos en líneas (un trozo puede cortar una línea por la mitad)", () => {
    const oidas: Voz[] = [];
    const dejar = escucharVoces((v) => oidas.push(v));
    const oyente = oyenteDeClaude("C:/wt/u1");
    const mitad = Math.floor(STREAM.length / 2);
    oyente(STREAM.slice(0, mitad));
    oyente(`${STREAM.slice(mitad)}\n`);
    decirVoz("otro", "texto", "   ");
    dejar();
    decirVoz("C:/wt/u1", "texto", "ya nadie escucha");
    expect(oidas.map((v) => v.texto)).toEqual(["Miro el botón.", "Después lo cambio.", "Edit src/ui/boton.tsx", "The file has been updated.\nmás", "Bash: npm test -- boton", "1 failed"]);
    expect(new Set(oidas.map((v) => v.donde))).toEqual(new Set(["C:/wt/u1"]));
  });
});

describe("las mascotas", () => {
  it("cada modelo con la suya: el líder de Claude es el bichito", () => {
    expect(mascotaDe("opus", "claude", true)).toBe("bicho");
    expect(mascotaDe("sonnet", "claude")).toBe("claude");
    expect(mascotaDe("gpt-5", "codex")).toBe("openai");
    expect(mascotaDe(undefined, "antigravity")).toBe("gemini");
    expect(mascotaDe("demo", "mentira", true)).toBe("dolphin");
  });

  it("el bichito camina trabajando, festeja al terminar y parpadea", () => {
    expect(bicho(0, "trabaja")).not.toEqual(bicho(200, "trabaja"));
    expect(bicho(500, "lista")[1]).toBe("#.########.#");
    expect(bicho(10, "espera")[2]).toBe("..########..");
    expect(bicho(500, "espera")[2]).toBe("..#.####.#..");
  });

  it("todas se dibujan en su recuadro y se mueven", () => {
    for (const m of ["bicho", "claude", "openai", "gemini", "dolphin"] as const) {
      const a = new Bufer(24, 8);
      const b = new Bufer(24, 8);
      pintarMascota(a, 0, 0, 24, 8, m, 1000, "trabaja", [22, 22, 22]);
      pintarMascota(b, 0, 0, 24, 8, m, 1180, "trabaja", [22, 22, 22]);
      expect(a.celdas.filter((c) => c.ch !== " ").length, m).toBeGreaterThan(10);
      expect(a.comoTexto().join("\n"), m).not.toBe(b.comoTexto().join("\n"));
    }
  });
});

describe("el compactado del agente", () => {
  it("un corte de contexto se cuenta, para que «no se acuerda» no parezca que se volvió tonto", () => {
    const voces = vocesDeClaude(
      JSON.stringify({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto" } }),
    );
    expect(voces).toEqual([
      { tipo: "compactado", texto: "Me quedé sin contexto: resumí lo que llevábamos y sigo." },
    ]);
  });

  it("si lo pediste vos, lo dice distinto", () => {
    const voces = vocesDeClaude(
      JSON.stringify({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual" } }),
    );
    expect(voces[0]?.texto).toBe("Resumí la charla porque me lo pediste.");
  });

  it("otro evento de sistema no inventa un compactado", () => {
    expect(vocesDeClaude(JSON.stringify({ type: "system", subtype: "init" }))).toEqual([]);
  });
})
