import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { armarPrompt, pedidoDeCorreccion } from "../src/agentes/claude.js";
import {
  MODELO_ANTIGRAVITY,
  PISTA_SIN_COMANDOS,
  argumentosDeAntigravity,
  argumentosDeCodex,
  leerSalidaDeAntigravity,
  tokensDeAntigravity,
  tokensDeCodex,
} from "../src/agentes/otros.js";
import { recordar } from "../src/nucleo/memoria.js";
import { contextoDeSiembra, sumarAlPerfil } from "../src/nucleo/perfil.js";

/**
 * La memoria es del proyecto, no del modelo: Antigravity y Codex reciben
 * el mismo pedido que Claude —con el perfil y las reglas adentro—, que es
 * lo que hace que uno barato encare las cosas como uno caro.
 */

describe("el mismo pedido para cualquier motor", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-motores-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("Antigravity recibe el perfil y las reglas del repo en el pedido, igual que Claude", async () => {
    await sumarAlPerfil(repo, "Hay monotributistas Y responsables inscriptos: todo lo nuevo cubre ambos");
    await recordar(repo, "los importes van con coma decimal");
    const contexto = await contextoDeSiembra(repo, "Sumá un reporte de ventas");
    const pedido = armarPrompt("Sumá un reporte de ventas", contexto);

    const args = argumentosDeAntigravity(pedido, {});
    // El pedido va entero, como último argumento de -p: agy no lo lee de la entrada estándar.
    expect(args.at(-2)).toBe("-p");
    expect(args.at(-1)!.startsWith(pedido)).toBe(true);
    expect(args.at(-1)).toContain(PISTA_SIN_COMANDOS);
    expect(args.at(-1)).toContain("responsables inscriptos");
    expect(args.at(-1)).toContain("coma decimal");
    expect(args.at(-1)).toContain("SUPERFICIES:"); // el contrato de superficie, también
  });

  it("Antigravity: acepta ediciones por defecto; corre solo con «todo», pero con la terminal en sandbox", () => {
    expect(argumentosDeAntigravity("x", {})).toEqual(
      expect.arrayContaining(["--mode", "accept-edits", "--model", MODELO_ANTIGRAVITY, "--output-format", "json"]),
    );
    const solo = argumentosDeAntigravity("x", { permisos: "todo" });
    expect(solo).toEqual(expect.arrayContaining(["--dangerously-skip-permissions", "--sandbox"]));
    expect(solo).not.toContain("accept-edits");
    expect(solo.at(-1)).toBe("x"); // sin la pista: puede correr comandos, en sandbox
    expect(argumentosDeAntigravity("x", {}, "claude-sonnet-4-6")).toEqual(expect.arrayContaining(["--model", "claude-sonnet-4-6"]));
  });

  it("Antigravity sobre un repo de afuera: sandbox aunque pida confirmaciones, y sin expandir lo que trae el repo", () => {
    expect(argumentosDeAntigravity("x", {})).not.toContain("--sandbox");
    const afuera = argumentosDeAntigravity("x", { deAfuera: true });
    expect(afuera).toEqual(expect.arrayContaining(["--mode", "accept-edits", "--sandbox", "--disable-slash-commands"]));
    expect(argumentosDeAntigravity("x", { deAfuera: true, permisos: "todo" }).filter((a) => a === "--sandbox")).toHaveLength(1);
  });

  it("Codex: el pedido entra por la entrada estándar y solo escribe en el worktree", () => {
    const args = argumentosDeCodex("C:/wt/u1", "C:/tmp/ultimo.txt", {});
    expect(args.slice(0, 2)).toEqual(["exec", "-"]);
    expect(args).toEqual(expect.arrayContaining(["-C", "C:/wt/u1", "--sandbox", "workspace-write", "-o", "C:/tmp/ultimo.txt"]));
    expect(args).not.toContain("-m"); // sin modelo pedido, el de la cuenta
    expect(argumentosDeCodex("C:/wt/u1", "o.txt", { modelo: "gpt-5.2-codex" })).toEqual(expect.arrayContaining(["-m", "gpt-5.2-codex"]));
  });

  it("Codex informa tokens y no plata: se leen de los eventos de --json, tal como salieron el 22/10", () => {
    expect(argumentosDeCodex("C:/wt/u1", "o.txt", {})).toContain("--json");
    // Lo que contestó codex exec --json de verdad, avisos incluidos.
    const eventos = [
      '{"type":"thread.started","thread_id":"01a1624c-57d7-7ec2-92be-ef420e8812a3"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Codex is ignoring 1 unrecognized configuration setting."}}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"hola"}}',
      '{"type":"turn.completed","usage":{"input_tokens":20261,"cached_input_tokens":13312,"cache_write_input_tokens":0,"output_tokens":5,"reasoning_output_tokens":0}}',
    ].join("\n");
    expect(tokensDeCodex(eventos)).toEqual({ entrada: 20261, salida: 5, cache: 13312 });
    // Dos turnos se suman; una línea que no es JSON se saltea; sin turnos no hay medida (no un cero).
    expect(tokensDeCodex(`${eventos}\naviso suelto turn.completed\n${eventos}`)).toEqual({ entrada: 40522, salida: 10, cache: 26624 });
    expect(tokensDeCodex('{"type":"thread.started"}')).toBeUndefined();
  });

  it("Antigravity también informa tokens y no plata: el razonamiento ya viene adentro de la salida", () => {
    // Lo que contestó agy --output-format json de verdad: total 6857 = 6831 de entrada + 26 de salida.
    const leido = leerSalidaDeAntigravity(
      '{"conversation_id":"2c62e3ca","status":"SUCCESS","response":"hola\\n","duration_seconds":3.25,"num_turns":1,"usage":{"input_tokens":6831,"output_tokens":26,"thinking_tokens":25,"cache_read_tokens":0,"total_tokens":6857}}',
    );
    expect(tokensDeAntigravity(leido)).toEqual({ entrada: 6831, salida: 26 });
    expect(tokensDeAntigravity(leerSalidaDeAntigravity('{"status":"SUCCESS","response":"x"}'))).toBeUndefined();
  });

  it("la corrección lleva el veredicto entero y pide el cambio más chico", () => {
    const pedido = pedidoDeCorreccion("arreglá el IVA", {
      verificador: "test",
      detalle: "test: ✖ suma el IVA dos veces",
      evidencia: "AssertionError: 242 !== 121",
    });
    expect(pedido).toContain("no pasó la fase «test»");
    expect(pedido).toContain("AssertionError: 242 !== 121");
    expect(pedido).toContain("cambio MÁS CHICO posible");
  });
});

describe("lo que devuelve Antigravity", () => {
  it("lee el JSON aunque venga con texto adelante", () => {
    const leido = leerSalidaDeAntigravity('aviso de actualización\n{"status":"SUCCESS","response":"RESUMEN: listo"}');
    expect(leido).toMatchObject({ status: "SUCCESS", response: "RESUMEN: listo" });
  });

  it("sin JSON es un error con lo que haya dicho, nunca un éxito", () => {
    expect(leerSalidaDeAntigravity("").status).toBe("ERROR");
    expect(leerSalidaDeAntigravity("Error: no hay sesión").error).toContain("no hay sesión");
  });
});
