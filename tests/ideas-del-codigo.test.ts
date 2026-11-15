import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { buscarIdeasEnElCodigo, todoDeLaLinea, todosAlTablero } from "../src/nucleo/ideas-del-codigo.js";
import { leerTablero, moverTarjeta } from "../src/nucleo/tarjetas.js";

/** Los TODO que ya están en el código entran al tablero como ideas, sin gastar un token. */

const correr = promisify(execFile);

describe("qué línea dice un TODO y cuál no", () => {
  it("lee la tarea de las formas en que la gente la escribe", () => {
    expect(todoDeLaLinea("// TODO: sacar el parche de Windows")).toEqual({ marca: "TODO", texto: "sacar el parche de Windows" });
    expect(todoDeLaLinea("  # FIXME esto se rompe con cero")).toEqual({ marca: "FIXME", texto: "esto se rompe con cero" });
    expect(todoDeLaLinea("/* TODO(nico): revisar el tope */")).toEqual({ marca: "TODO", texto: "revisar el tope" });
    expect(todoDeLaLinea("<!-- TODO — poner la captura -->")).toEqual({ marca: "TODO", texto: "poner la captura" });
    expect(todoDeLaLinea("// HACK: anda, no sé por qué")).toEqual({ marca: "HACK", texto: "anda, no sé por qué" });
  });

  it("no confunde una palabra que empieza igual con una tarea", () => {
    // Sin esto, «TODOS los clientes» entraba al tablero como tarea.
    expect(todoDeLaLinea("// TODOS los clientes pagan igual")).toBeUndefined();
    expect(todoDeLaLinea("const todosLosPedidos = []")).toBeUndefined();
    expect(todoDeLaLinea("// FIXMEs pendientes")).toBeUndefined();
  });

  it("una marca sin nada escrito al lado no es una tarea", () => {
    expect(todoDeLaLinea("// TODO")).toBeUndefined();
    expect(todoDeLaLinea("// TODO:")).toBeUndefined();
    expect(todoDeLaLinea("// TODO: ok")).toBeUndefined();
  });
});

describe("los TODO del código al tablero", () => {
  let repo = "";
  const git = (args: readonly string[]) => correr("git", [...args], { cwd: repo, windowsHide: true });

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-todos-"));
    await mkdir(join(repo, "src"), { recursive: true });
    await mkdir(join(repo, "node_modules", "paquete"), { recursive: true });
    await writeFile(join(repo, "src", "pagar.ts"), ["export const pagar = () => 1;", "// TODO: cobrar en pesos también", "// FIXME: el redondeo pierde un centavo"].join("\n"));
    await writeFile(join(repo, "src", "limpio.ts"), "export const limpio = () => 2;\n");
    // Lo ignorado no entra: ni lo de node_modules ni lo que no sigue git.
    await writeFile(join(repo, "node_modules", "paquete", "index.js"), "// TODO: esto es de otro\n");
    await writeFile(join(repo, "sin-trackear.ts"), "// TODO: todavía no está en git\n");
    await writeFile(join(repo, ".gitignore"), "node_modules\nsin-trackear.ts\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await git(args);
    }
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("encuentra los del código versionado y deja afuera lo ignorado", async () => {
    const ideas = await buscarIdeasEnElCodigo(repo);
    expect(ideas.map((i) => [i.archivo.replace(/\\/g, "/"), i.linea, i.texto])).toEqual([
      ["src/pagar.ts", 2, "cobrar en pesos también"],
      ["src/pagar.ts", 3, "el redondeo pierde un centavo"],
    ]);
  });

  it("los pone como ideas, con el archivo y la línea para ir a leer", async () => {
    const nuevas = await todosAlTablero(repo);
    expect(nuevas).toHaveLength(2);
    expect(nuevas[0]).toMatchObject({ titulo: "cobrar en pesos también", tipo: "idea", columna: "ideas", origen: "código (TODO)" });
    expect(nuevas[0]?.detalle).toContain("src/pagar.ts:2");
    expect(nuevas[1]?.origen).toBe("código (FIXME)");
  });

  it("correrlo dos veces no llena el tablero de repetidos", async () => {
    await todosAlTablero(repo);
    expect(await todosAlTablero(repo)).toEqual([]);
    expect(await leerTablero(repo)).toHaveLength(2);
  });

  it("un TODO que se movió de línea sigue siendo el mismo", async () => {
    await todosAlTablero(repo);
    await writeFile(join(repo, "src", "pagar.ts"), ["// un comentario nuevo arriba", "export const pagar = () => 1;", "// TODO: cobrar en pesos también", "// FIXME: el redondeo pierde un centavo"].join("\n"));
    expect(await todosAlTablero(repo)).toEqual([]);
  });

  it("y uno nuevo entra sin traer de nuevo los viejos", async () => {
    await todosAlTablero(repo);
    await writeFile(join(repo, "src", "limpio.ts"), "// TODO: y acá falta el borde\n");
    await git(["add", "-A"]);
    const nuevas = await todosAlTablero(repo);
    expect(nuevas.map((t) => t.titulo)).toEqual(["y acá falta el borde"]);
  });

  it("que el TODO desaparezca del código no borra la tarjeta: puede estar haciéndose", async () => {
    const [primera] = await todosAlTablero(repo);
    await moverTarjeta(repo, primera!.id, "haciendo");
    await writeFile(join(repo, "src", "pagar.ts"), "export const pagar = () => 1;\n");
    await todosAlTablero(repo);
    const tablero = await leerTablero(repo);
    expect(tablero.find((t) => t.id === primera!.id)?.columna).toBe("haciendo");
  });

  it("sin el archivo de vistos tampoco se duplica: el tablero es el que manda", async () => {
    await todosAlTablero(repo);
    await borrarCarpeta(join(repo, ".dolphin", "todos-vistos.json"));
    expect(await todosAlTablero(repo)).toEqual([]);
  });

  it("un repo con cientos no inunda el tablero, y los que no entraron no vuelven mañana como nuevos", async () => {
    const muchos = Array.from({ length: 30 }, (_, i) => `// TODO: tarea número ${i}`).join("\n");
    await writeFile(join(repo, "src", "muchos.ts"), muchos);
    await git(["add", "-A"]);
    expect(await todosAlTablero(repo, 5)).toHaveLength(5);
    // Los 27 que quedaron afuera ya se vieron: no se proponen de nuevo como si fueran nuevos.
    expect(await todosAlTablero(repo, 5)).toEqual([]);
  });

  it("un repo sin TODO no crea nada ni escribe de más", async () => {
    await writeFile(join(repo, "src", "pagar.ts"), "export const pagar = () => 1;\n");
    expect(await todosAlTablero(repo)).toEqual([]);
    expect(await leerTablero(repo)).toEqual([]);
  });
});
