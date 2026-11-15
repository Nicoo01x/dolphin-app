import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { anotarComando, archivoDeRama, comoSeLee, leerBitacora, resumenDeBitacora, TOPE_DE_SALIDA } from "../src/nucleo/bitacora.js";
import { verificadorDeComando } from "../src/nucleo/verificadores.js";

/** Lo que se corrió de verdad sobre una rama, para poder revisarla sin creerle al agente. */

describe("la bitácora de una rama", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-bitacora-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("anota cada comando con su código de salida, en orden", async () => {
    await anotarComando(repo, "u1", { cmd: "npm", args: ["run", "typecheck"], codigo: 0, ms: 1200, salida: "sin errores", fase: "typecheck" });
    await anotarComando(repo, "u1", { cmd: "npm", args: ["test"], codigo: 1, ms: 3400, salida: "1 failed", fase: "test" });
    const entradas = await leerBitacora(repo, "u1");
    expect(entradas.map((e) => [comoSeLee(e), e.codigo])).toEqual([
      ["npm run typecheck", 0],
      ["npm test", 1],
    ]);
    expect(entradas[0]?.fase).toBe("typecheck");
    expect(resumenDeBitacora(entradas)).toEqual({ corridos: 2, fallados: 1, ms: 4600 });
  });

  it("cada rama tiene la suya, y un nombre con barras no se sale de la carpeta", async () => {
    await anotarComando(repo, "dolphin/u1", { cmd: "git", args: ["status"], codigo: 0, ms: 10, salida: "" });
    await anotarComando(repo, "u2", { cmd: "git", args: ["log"], codigo: 0, ms: 10, salida: "" });
    expect(archivoDeRama("dolphin/u1")).toBe("dolphin_u1.jsonl");
    expect(archivoDeRama("../../fuera")).not.toContain("..");
    expect((await leerBitacora(repo, "dolphin/u1")).map((e) => e.args[0])).toEqual(["status"]);
    expect((await leerBitacora(repo, "u2")).map((e) => e.args[0])).toEqual(["log"]);
  });

  it("una salida enorme se recorta y dice cuánto medía: la bitácora se tiene que poder leer", async () => {
    await anotarComando(repo, "u1", { cmd: "npm", args: ["test"], codigo: 1, ms: 1, salida: "x".repeat(TOPE_DE_SALIDA + 500) });
    const [entrada] = await leerBitacora(repo, "u1");
    expect(entrada!.salida).toHaveLength(TOPE_DE_SALIDA + 1);
    expect(entrada!.salidaEntera).toBe(TOPE_DE_SALIDA + 500);
  });

  it("una salida con saltos de línea no parte la bitácora en dos entradas", async () => {
    await anotarComando(repo, "u1", { cmd: "npm", args: ["test"], codigo: 1, ms: 1, salida: "primera\nsegunda\n{\"cmd\":\"falso\"}\n" });
    const entradas = await leerBitacora(repo, "u1");
    expect(entradas).toHaveLength(1);
    expect(entradas[0]?.salida).toContain("segunda");
  });

  it("guarda dónde corrió y cómo se corrió de verdad cuando no es lo mismo", async () => {
    await anotarComando(repo, "u1", { cmd: "npm", args: ["test"], cwd: join(repo, "web"), codigo: 0, ms: 1, salida: "" });
    // El worktree de una rama vive en una carpeta temporal, fuera del repo: ahí se guarda su
    // nombre y no «../../../../../dolphin-EF5u2I/equipo», que no le dice nada a nadie.
    await anotarComando(repo, "u2", {
      cmd: "npm",
      args: ["test"],
      cwd: join(repo, "..", "dolphin-EF5u2I", "equipo"),
      corrioComo: 'cmd.exe /d /s /c "npm test"',
      codigo: 0,
      ms: 1,
      salida: "",
    });
    expect((await leerBitacora(repo, "u1"))[0]?.donde).toBe("web");
    const [deAfuera] = await leerBitacora(repo, "u2");
    expect(deAfuera!.donde).toBe("dolphin-EF5u2I/equipo");
    expect(deAfuera!.corrioComo).toContain("cmd.exe");
  });

  it("una línea a medio escribir no se lleva las demás", async () => {
    await anotarComando(repo, "u1", { cmd: "npm", args: ["test"], codigo: 0, ms: 1, salida: "" });
    const archivo = join(repo, ".dolphin", "bitacora", "u1.jsonl");
    await writeFile(archivo, `${await readFile(archivo, "utf8")}{"cmd":"a medio escr`);
    await anotarComando(repo, "u1", { cmd: "git", args: ["log"], codigo: 0, ms: 1, salida: "" });
    expect((await leerBitacora(repo, "u1")).map((e) => e.cmd)).toEqual(["npm", "git"]);
  });

  it("un repo sin bitácora no es un error: no se corrió nada todavía", async () => {
    expect(await leerBitacora(repo, "u9")).toEqual([]);
    expect(resumenDeBitacora([])).toEqual({ corridos: 0, fallados: 0, ms: 0 });
  });

  it("no ensucia el repo de nadie: la carpeta nace ignorada", async () => {
    await anotarComando(repo, "u1", { cmd: "git", args: ["status"], codigo: 0, ms: 1, salida: "" });
    expect(await readFile(join(repo, ".dolphin", ".gitignore"), "utf8")).toBe("*\n");
  });

  it("una fase del portón se anota sola, con lo que escribió y su código de salida", async () => {
    const universo = { id: "u1", rama: "dolphin/u1", ruta: repo, nacido: Date.now(), repo };
    const pasa = verificadorDeComando({ nombre: "tipos", cmd: process.execPath, args: ["-e", "console.log('sin errores')"] });
    const falla = verificadorDeComando({ nombre: "test", cmd: process.execPath, args: ["-e", "console.log('1 failed'); process.exit(1)"] });
    expect((await pasa.correr(universo)).paso).toBe(true);
    expect((await falla.correr(universo)).paso).toBe(false);

    const entradas = await leerBitacora(repo, "dolphin/u1");
    expect(entradas.map((e) => [e.fase, e.codigo])).toEqual([
      ["tipos", 0],
      ["test", 1],
    ]);
    expect(entradas[1]?.salida).toContain("1 failed");
    // La fase que pasó también queda: la bitácora es lo que se corrió, no lo que falló.
    expect(entradas[0]?.salida).toContain("sin errores");
    expect(entradas.every((e) => e.ms >= 0)).toBe(true);
  }, 30_000);

  it("sin repo en el universo no se anota nada, y la fase corre igual", async () => {
    const universo = { id: "u1", rama: "dolphin/u1", ruta: repo, nacido: Date.now() };
    const v = verificadorDeComando({ nombre: "tipos", cmd: process.execPath, args: ["-e", "''"] });
    expect((await v.correr(universo)).paso).toBe(true);
    expect(await leerBitacora(repo, "dolphin/u1")).toEqual([]);
  }, 30_000);

  it("anotar en paralelo no pierde ni mezcla comandos", async () => {
    await Promise.all(
      Array.from({ length: 30 }, (_, i) => anotarComando(repo, "u1", { cmd: "npm", args: [`t${i}`], codigo: 0, ms: 1, salida: "y".repeat(500) })),
    );
    const entradas = await leerBitacora(repo, "u1");
    expect(entradas).toHaveLength(30);
    expect(new Set(entradas.map((e) => e.args[0])).size).toBe(30);
  });
});
