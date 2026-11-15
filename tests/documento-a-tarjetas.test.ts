import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { documentoATarjetas, pendientesDelTexto } from "../src/nucleo/documento-a-tarjetas.js";
import { crearTarjeta, leerTablero } from "../src/nucleo/tarjetas.js";

/** Un documento con una lista de cosas se vuelve tarjetas, sin gastar un token. */

const DOCUMENTO = [
  "# Lo que falta del panel",
  "",
  "Algunas notas sueltas que no son tareas.",
  "",
  "## Pantalla de alta",
  "",
  "- [ ] el botón de guardar no avisa cuando falla",
  "- [x] poner el logo arriba",
  "- validar el **CUIT** antes de mandar",
  "  - con guiones y sin guiones",
  "",
  "## Facturas",
  "",
  "1. arreglar el total que se rompe con descuento",
  "2. bajar la lista en `CSV`",
  "* ver [la doc](https://ejemplo.com) de ARCA",
  "- ok",
].join("\n");

describe("qué dice un documento", () => {
  it("saca los ítems de lista y deja los párrafos afuera", () => {
    const p = pendientesDelTexto(DOCUMENTO);
    expect(p.map((x) => x.titulo)).toEqual([
      "el botón de guardar no avisa cuando falla",
      "validar el CUIT antes de mandar",
      "arreglar el total que se rompe con descuento",
      "bajar la lista en CSV",
      "ver la doc de ARCA",
    ]);
  });

  it("lo ya marcado no entra: está hecho", () => {
    expect(pendientesDelTexto(DOCUMENTO).map((x) => x.titulo)).not.toContain("poner el logo arriba");
  });

  it("lo anidado tampoco: es el cómo de su padre, no otra tarea", () => {
    expect(pendientesDelTexto(DOCUMENTO).map((x) => x.titulo)).not.toContain("con guiones y sin guiones");
  });

  it("cada uno se acuerda de su sección y de su línea", () => {
    const p = pendientesDelTexto(DOCUMENTO);
    expect(p[0]).toMatchObject({ seccion: "Pantalla de alta", linea: 7 });
    expect(p[2]?.seccion).toBe("Facturas");
  });

  it("lo que suena a algo roto entra como bug", () => {
    const p = pendientesDelTexto(DOCUMENTO);
    expect(p.find((x) => x.titulo.startsWith("arreglar"))?.tipo).toBe("bug");
    expect(p.find((x) => x.titulo.startsWith("bajar"))?.tipo).toBe("tarea");
  });

  it("un documento sin listas no da nada", () => {
    expect(pendientesDelTexto("# Notas\n\nUn párrafo y nada más.\n")).toEqual([]);
  });
});

describe("del documento al tablero", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-documento-"));
    await writeFile(join(repo, "PENDIENTES.md"), DOCUMENTO);
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("crea una tarjeta por pendiente, con de dónde salió", async () => {
    const nuevas = await documentoATarjetas(repo, "PENDIENTES.md");
    expect(nuevas).toHaveLength(5);
    expect(nuevas[0]).toMatchObject({ titulo: "el botón de guardar no avisa cuando falla", origen: "documento (PENDIENTES.md)" });
    expect(nuevas[0]?.detalle).toContain("PENDIENTES.md:7");
    expect(nuevas[0]?.detalle).toContain("Sección: Pantalla de alta");
  });

  it("correrlo dos veces no duplica, y un documento que creció trae solo lo nuevo", async () => {
    await documentoATarjetas(repo, "PENDIENTES.md");
    expect(await documentoATarjetas(repo, "PENDIENTES.md")).toEqual([]);
    await writeFile(join(repo, "PENDIENTES.md"), `${DOCUMENTO}\n- mandar el recordatorio por mail`);
    expect((await documentoATarjetas(repo, "PENDIENTES.md")).map((t) => t.titulo)).toEqual(["mandar el recordatorio por mail"]);
    expect(await leerTablero(repo)).toHaveLength(6);
  });

  it("lo que ya anotaste a mano no vuelve a entrar por el documento", async () => {
    await crearTarjeta(repo, { titulo: "Validar el CUIT antes de mandar" });
    const nuevas = await documentoATarjetas(repo, "PENDIENTES.md");
    expect(nuevas.map((t) => t.titulo)).not.toContain("validar el CUIT antes de mandar");
    expect(nuevas).toHaveLength(4);
  });

  it("un documento enorme no inunda el tablero", async () => {
    await writeFile(join(repo, "muchas.md"), Array.from({ length: 80 }, (_, i) => `- tarea número ${i}`).join("\n"));
    expect(await documentoATarjetas(repo, "muchas.md", 10)).toHaveLength(10);
  });

  it("un archivo que no está lo dice, en vez de no hacer nada en silencio", async () => {
    await expect(documentoATarjetas(repo, "no-esta.md")).rejects.toThrow();
  });
});
