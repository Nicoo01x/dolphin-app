import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { contextoDeSpecs, leerSpecs, rutasDeStatus, specsSinActualizar, validarSpecs, verificadorDeSpecs } from "../src/nucleo/spec.js";
import { planificar } from "../src/nucleo/plan.js";

let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-spec-"));
});

afterEach(async () => {
  await borrarCarpeta(repo);
});

describe("SPEC.md", () => {
  it("lee el frontmatter y detecta links rotos, ids repetidos y ciclos", async () => {
    await mkdir(join(repo, "src"), { recursive: true });
    await writeFile(join(repo, "SPEC.md"), "---\nid: raiz\nstatus: active\n---\n# Raíz\n");
    await writeFile(join(repo, "src", "SPEC.md"), "---\nid: raiz\nparent: falta\ndepends-on: [raiz]\nstatus: nope\n---\n# Código\n");
    const specs = await leerSpecs(repo);
    expect(specs.map((s) => s.relativa)).toEqual(["SPEC.md", "src/SPEC.md"]);
    expect(validarSpecs(specs).join("\n")).toMatch(/id duplicado|link roto|status inválido|ciclo/);
  });

  it("agrega el SPEC al contexto del planificador", async () => {
    await writeFile(join(repo, "SPEC.md"), "---\nid: tienda\nstatus: active\n---\nNo romper precios.\n");
    expect(await contextoDeSpecs(repo)).toContain("No romper precios.");
    let pedido = "";
    await planificar("arreglar precios", repo, async (prompt) => {
      pedido = prompt;
      return { texto: '{"tareas":[{"tarea":"arreglar precios"}]}', gastado: 0 };
    });
    expect(pedido).toContain("No romper precios.");
  });

  it("avisa si cambia una carpeta sin tocar su SPEC, pero deja pasar", async () => {
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "test@dolphin.local"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "test"], { cwd: repo });
    await mkdir(join(repo, "src"), { recursive: true });
    await writeFile(join(repo, "src", "SPEC.md"), "---\nid: src\nstatus: active\n---\n");
    await writeFile(join(repo, "src", "a.ts"), "export const a = 1;\n");
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: repo });
    await writeFile(join(repo, "src", "a.ts"), "export const a = 2;\n");
    const resultado = await verificadorDeSpecs().correr({ id: "u1", rama: "x", ruta: repo, base: "HEAD", nacido: 0 });
    expect(resultado.paso).toBe(true);
    expect(resultado.detalle).toContain("sin actualizar su SPEC.md");
  });

  it("un renombre trae las dos rutas enteras: la vieja viene sin «XY» adelante", () => {
    expect(rutasDeStatus("R  src/nuevo.ts\0src/viejo.ts\0 M otro/a.ts\0?? suelto.md\0")).toEqual(["src/nuevo.ts", "src/viejo.ts", "otro/a.ts", "suelto.md"]);
    expect(rutasDeStatus("")).toEqual([]);
  });

  it("cada cambio le toca al SPEC más cercano; el de la raíz no avisa en todas las ramas", () => {
    const spec = (relativa: string) => ({ ruta: relativa, relativa, id: relativa, dependeDe: [], status: "active" as const, texto: "" });
    const specs = [spec("SPEC.md"), spec("src/SPEC.md"), spec("src/precios/SPEC.md")];
    expect(specsSinActualizar(specs, ["README.md", "package.json"])).toEqual([]);
    expect(specsSinActualizar(specs, ["src/precios/iva.ts"]).map((s) => s.relativa)).toEqual(["src/precios/SPEC.md"]);
    expect(specsSinActualizar(specs, ["src/app.ts", "src/precios/iva.ts", "src/precios/SPEC.md"]).map((s) => s.relativa)).toEqual(["src/SPEC.md"]);
    // «src/preciosviejos» no está adentro de «src/precios».
    expect(specsSinActualizar(specs, ["src/preciosviejos/a.ts"]).map((s) => s.relativa)).toEqual(["src/SPEC.md"]);
  });

  it("mover un archivo fuera de una carpeta con SPEC también la cambia", async () => {
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "test@dolphin.local"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "test"], { cwd: repo });
    await mkdir(join(repo, "src", "precios"), { recursive: true });
    await writeFile(join(repo, "SPEC.md"), "---\nid: raiz\nstatus: active\n---\n");
    await writeFile(join(repo, "src", "precios", "SPEC.md"), "---\nid: precios\nparent: raiz\nstatus: active\n---\n");
    await writeFile(join(repo, "src", "precios", "iva.ts"), "export const iva = 0.21;\n");
    execFileSync("git", ["add", "."], { cwd: repo });
    execFileSync("git", ["commit", "-q", "-m", "base"], { cwd: repo });
    execFileSync("git", ["mv", "src/precios/iva.ts", "iva.ts"], { cwd: repo });
    const resultado = await verificadorDeSpecs().correr({ id: "u1", rama: "x", ruta: repo, base: "HEAD", nacido: 0 });
    expect(resultado.evidencia?.split("\n")).toEqual(["src/precios/SPEC.md: la rama cambia esta carpeta sin actualizar su SPEC.md"]);
  });
});
