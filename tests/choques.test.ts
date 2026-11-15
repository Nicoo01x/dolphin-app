import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { archivosTocados, choquesNuevos, vigilarChoques, type Choque } from "../src/equipo/choques.js";
import { pedidoDelCompanero } from "../src/equipo/equipo.js";
import { esperaA, limpiarTareas, rutasSePisan } from "../src/nucleo/plan.js";

/**
 * Los choques del equipo: el plan encadena solo las tareas que dicen tocar lo mismo, y mientras
 * trabajan se avisa si dos compañeros en paralelo se meten en el mismo archivo. Con git de verdad.
 */

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });

describe("el plan encadena las tareas que se pisan", () => {
  const tarea = (id: string, archivos: unknown, extra: Record<string, unknown> = {}) => ({ id, tarea: `hacer ${id}`, archivos, ...extra });

  it("la que toca archivos de una anterior pasa a esperarla", () => {
    const tareas = limpiarTareas([tarea("t1", ["src/carrito.ts"]), tarea("t2", ["src/pago.ts"]), tarea("t3", ["./src\\carrito.ts", "tests/carrito.test.ts"])]);
    expect(tareas.map((t) => t.dependeDe)).toEqual([undefined, undefined, "t1"]);
    expect(tareas[2]!.archivos).toEqual(["src/carrito.ts", "tests/carrito.test.ts"]);
  });

  it("una carpeta pisa a lo que tiene adentro", () => {
    expect(rutasSePisan("src/ui/", "src/ui/boton.tsx")).toBe(true);
    expect(rutasSePisan("src/ui", "src/ui/boton.tsx")).toBe(false);
    const tareas = limpiarTareas([tarea("t1", ["src/ui/"]), tarea("t2", ["src/ui/boton.tsx"])]);
    expect(tareas[1]!.dependeDe).toBe("t1");
  });

  it("la que ya espera a otra no se cambia, y las rutas raras se descartan", () => {
    const tareas = limpiarTareas([
      tarea("t1", ["a.ts"]),
      tarea("t2", ["b.ts"]),
      tarea("t3", ["b.ts", "../afuera.ts", "/absoluta.ts", 3], { dependeDe: "t1" }),
    ]);
    expect(tareas[2]!.dependeDe).toBe("t1");
    expect(tareas[2]!.archivos).toEqual(["b.ts"]);
    expect(esperaA(tareas, "t3", "t1")).toBe(true);
    expect(esperaA(tareas, "t2", "t1")).toBe(false);
  });

  it("sin archivos, el plan queda como lo armó el líder", () => {
    const tareas = limpiarTareas([tarea("t1", undefined), tarea("t2", [])]);
    expect(tareas.map((t) => t.dependeDe)).toEqual([undefined, undefined]);
    expect(tareas[1]!.archivos).toBeUndefined();
  });

  it("el compañero recibe su lista de archivos en el pedido", () => {
    expect(pedidoDelCompanero({ tarea: "sumar cupones" })).toBe("sumar cupones");
    const pedido = pedidoDelCompanero({ tarea: "sumar cupones", archivos: ["src/cupon.ts"] });
    expect(pedido).toContain("Archivos de esta tarea: src/cupon.ts.");
    expect(pedido).toContain("no toques archivos fuera de esta lista");
  });
});

describe("los choques que no se avisaron", () => {
  const tocados = (o: Record<string, string[]>) => new Map(Object.entries(o).map(([id, a]) => [id, new Set(a)]));

  it("avisa el par que toca lo mismo, una sola vez por archivo", () => {
    const vistos = new Set<string>();
    const nadie = () => false;
    expect(choquesNuevos(tocados({ t2: ["x.ts", "y.ts"], t1: ["x.ts"], t3: ["z.ts"] }), nadie, vistos)).toEqual([{ ids: ["t1", "t2"], archivos: ["x.ts"] }]);
    expect(choquesNuevos(tocados({ t1: ["x.ts"], t2: ["x.ts"] }), nadie, vistos)).toEqual([]);
    // Un archivo nuevo del mismo par sí es noticia.
    expect(choquesNuevos(tocados({ t1: ["x.ts", "y.ts"], t2: ["x.ts", "y.ts"] }), nadie, vistos)).toEqual([{ ids: ["t1", "t2"], archivos: ["y.ts"] }]);
  });

  it("las encadenadas pueden tocar lo mismo: trabajan una encima de la otra", () => {
    const encadenadas = (a: string, b: string) => (a === "t1" && b === "t2") || (a === "t2" && b === "t1");
    expect(choquesNuevos(tocados({ t1: ["x.ts"], t2: ["x.ts"] }), encadenadas, new Set())).toEqual([]);
  });
});

describe("la vigilancia sobre worktrees de verdad", () => {
  let repo = "";
  let uno = "";
  let dos = "";
  let base = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-choques-"));
    await writeFile(join(repo, "a.js"), "export const a = 1\n");
    await writeFile(join(repo, "b.js"), "export const b = 1\n");
    await git(["init", "-q"], repo);
    await git(["config", "user.email", "nico@ejemplo.com"], repo);
    await git(["config", "user.name", "Nico"], repo);
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "base"], repo);
    base = (await git(["rev-parse", "HEAD"], repo)).stdout.trim();
    uno = `${repo}-uno`;
    dos = `${repo}-dos`;
    await git(["worktree", "add", "-q", "-b", "uno", uno], repo);
    await git(["worktree", "add", "-q", "-b", "dos", dos], repo);
  });

  afterEach(async () => {
    await git(["worktree", "remove", "--force", uno], repo).catch(() => {});
    await git(["worktree", "remove", "--force", dos], repo).catch(() => {});
    await Promise.all([repo, uno, dos].map((r) => borrarCarpeta(r)));
  });

  it("ve lo commiteado, lo sin commitear y lo nuevo", async () => {
    await writeFile(join(uno, "a.js"), "export const a = 2\n");
    await git(["commit", "-qam", "cambia a"], uno);
    await writeFile(join(uno, "b.js"), "export const b = 2\n");
    await writeFile(join(uno, "nuevo.js"), "export const n = 1\n");
    expect([...(await archivosTocados(uno, base))].sort()).toEqual(["a.js", "b.js", "nuevo.js"]);
    expect([...(await archivosTocados(dos, base))]).toEqual([]);
  });

  it("dos compañeros en paralelo tocando el mismo archivo dan aviso antes de integrar", async () => {
    const choques: Choque[] = [];
    const vigilancia = vigilarChoques({
      base,
      worktrees: () => new Map([["t1", uno], ["t2", dos]]),
      encadenadas: () => false,
      alChocar: (c) => choques.push(c),
      cadaMs: 60_000,
    });
    try {
      await writeFile(join(uno, "a.js"), "export const a = 'de uno'\n");
      await writeFile(join(dos, "b.js"), "export const b = 'de dos'\n");
      await vigilancia.mirar();
      expect(choques).toEqual([]);
      await writeFile(join(dos, "a.js"), "export const a = 'de dos'\n");
      await vigilancia.mirar();
      expect(choques).toEqual([{ ids: ["t1", "t2"], archivos: ["a.js"] }]);
      await vigilancia.mirar();
      expect(choques).toHaveLength(1);
    } finally {
      vigilancia.parar();
    }
  });
});
