import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { firmaDeFallo, herramientaQueFalta, pedidoConPistas, siguientePaso, type Intento } from "../src/nucleo/persistir.js";
import { Sesion } from "../src/tui/sesion.js";

/**
 * Perseguir un objetivo hasta lograrlo: la escalera (reintentar con la pista, escalar si falla igual,
 * pedir ayuda arriba de todo), lo que falta en la máquina y el presupuesto. Y /objetivo de punta a
 * punta con el agente de mentira y un portón que falla de verdad.
 */

const fallo = (porQue: string, modelo = "sonnet", gastado = 0): Intento => ({ ok: false, porQue, modelo, gastado });
const escalera = ["sonnet", "opus"];

describe("la firma de un fallo", () => {
  it("ignora lo que cambia de corrida en corrida", () => {
    const a = firmaDeFallo("la integración no pasó test: 3 failed en C:\\tmp\\wt-abc123\\src\\a.test.ts (1.24s) «suma»");
    const b = firmaDeFallo("la integración no pasó test: 5 failed en C:\\tmp\\wt-9f9f9f9\\src\\a.test.ts (0.9s) «resta»");
    expect(a).toBe(b);
    expect(firmaDeFallo("no pasó typecheck")).not.toBe(firmaDeFallo("no pasó test"));
  });

  it("reconoce lo que falta en la máquina: un módulo o un comando", () => {
    expect(herramientaQueFalta("Error: Cannot find module 'zod'")).toEqual({ falta: "zod", modulo: true });
    expect(herramientaQueFalta("'pytest' is not recognized as an internal or external command")).toEqual({ falta: "pytest", modulo: false });
    expect(herramientaQueFalta("sh: 1: vitest: not found")).toMatchObject({ falta: "vitest", modulo: false });
    expect(herramientaQueFalta("test: no encontré «go», se salteó")).toEqual({ falta: "go", modulo: false });
    expect(herramientaQueFalta("2 tests failed")).toBeUndefined();
  });
});

describe("la escalera", () => {
  it("lo logrado es listo; un fallo nuevo se reintenta con la pista", () => {
    expect(siguientePaso([{ ok: true, porQue: "", modelo: "sonnet", gastado: 0 }], { escalera })).toEqual({ accion: "listo" });
    expect(siguientePaso([fallo("no pasó test")], { escalera })).toEqual({ accion: "reintentar", pista: "no pasó test" });
  });

  it("si cambió el error hubo progreso: se reintenta, no se escala", () => {
    expect(siguientePaso([fallo("no pasó typecheck"), fallo("no pasó test")], { escalera }).accion).toBe("reintentar");
  });

  it("el mismo fallo dos veces escala al modelo siguiente; arriba de todo, pide ayuda", () => {
    expect(siguientePaso([fallo("no pasó test: 3 failed"), fallo("no pasó test: 2 failed")], { escalera })).toMatchObject({ accion: "escalar", modelo: "opus" });
    const arriba = siguientePaso([fallo("no pasó test", "opus"), fallo("no pasó test", "opus")], { escalera });
    expect(arriba.accion).toBe("ayuda");
  });

  it("corta antes de gastar la reserva del presupuesto, y después de demasiados intentos", () => {
    expect(siguientePaso([fallo("a", "sonnet", 2), fallo("b", "sonnet", 2.3)], { escalera, presupuesto: 5 }).accion).toBe("ayuda");
    expect(siguientePaso([fallo("a"), fallo("b"), fallo("c")], { escalera, maxIntentos: 3 }).accion).toBe("ayuda");
  });

  it("si falta un módulo instala lo del repo una vez; si sigue faltando, o es un comando, avisa", () => {
    expect(siguientePaso([fallo("Cannot find module 'zod'")], { escalera, gestor: "pnpm" })).toEqual({ accion: "herramienta", falta: "zod", instalar: { cmd: "pnpm", args: ["install", "--frozen-lockfile", "--ignore-scripts"] } });
    // Un archivo del repo que no está no es un paquete que falte: eso lo arregla el agente, se reintenta.
    expect(siguientePaso([fallo("TS2307: Cannot find module './csv'")], { escalera, gestor: "pnpm" }).accion).toBe("reintentar");
    expect(siguientePaso([fallo("Cannot find module 'zod'"), fallo("Cannot find module 'zod'")], { escalera, gestor: "pnpm" }).accion).toBe("ayuda");
    expect(siguientePaso([fallo("'pytest' is not recognized as an internal or external command")], { escalera })).toEqual({ accion: "herramienta", falta: "pytest" });
  });

  it("el pedido siguiente lleva lo que ya falló, para no repetirlo", () => {
    const pedido = pedidoConPistas("exportar a CSV", [fallo("no pasó test", "sonnet")]);
    expect(pedido).toContain("exportar a CSV");
    expect(pedido).toContain("1. (sonnet) no pasó test");
    expect(pedidoConPistas("x", [])).toBe("x");
  });
});

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";

async function repoCon(codigo: string): Promise<void> {
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module", scripts: { sintaxis: "node --check src/a.js" } }));
  await writeFile(join(repo, "src", "a.js"), codigo);
  await git(["init", "-q"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-persistir-"));
});
afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

describe("/objetivo de punta a punta", () => {
  it("con el portón pasando, lo logra a la primera", async () => {
    await repoCon("export const suma = (a, b) => a + b\n");
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] });
    await sesion.recibir("/objetivo exportar a CSV");
    expect(sesion.mensajes.at(-1)?.texto).toMatch(/Lo logré en 1 intento: dolphin-equipo\//);
    sesion.cerrar();
  }, 120_000);

  it("si falla siempre igual, reintenta con la pista y después pide ayuda (sin escalar: no hay a quién)", async () => {
    // El código base no compila: ningún agente de mentira lo arregla, así que el portón falla igual siempre.
    await repoCon("export const suma = (a, b => a + b\n");
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] });
    const intentos = await sesion.perseguir("exportar a CSV");
    expect(intentos).toHaveLength(2);
    expect(intentos.every((i) => !i.ok)).toBe(true);
    const textos = sesion.mensajes.map((m) => m.texto);
    expect(textos.some((t) => t.startsWith("Necesito que lo mires: falla siempre igual"))).toBe(true);
    // El segundo intento llevó lo que falló en el primero.
    expect(sesion.equipo?.objetivo).toContain("Los intentos anteriores no salieron");
    sesion.cerrar();
  }, 180_000);
});
