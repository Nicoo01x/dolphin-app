import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { recordar } from "../src/nucleo/memoria.js";
import { contextoDePerfil, contextoDeSiembra, guardarPerfil, leerPerfil, sumarAlPerfil } from "../src/nucleo/perfil.js";

/**
 * El perfil del proyecto: las verdades del dominio que viajan ENTERAS en
 * todos los prompts, con cualquier modelo. Lo que hace que no haya que
 * repetirle las cosas al agente.
 */

describe("el perfil del proyecto", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-perfil-"));
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("sin perfil no hay contexto: no se inventa nada", async () => {
    expect(await leerPerfil(repo)).toBe("");
    expect(contextoDePerfil("")).toBe("");
  });

  it("lo guardado vuelve entero, y el contexto lo encabeza como lo que no se olvida", async () => {
    await guardarPerfil(repo, "- Hay monotributistas Y responsables inscriptos: todo lo nuevo cubre ambos.\n- Los importes van con coma decimal.");
    const perfil = await leerPerfil(repo);
    expect(perfil).toContain("responsables inscriptos");

    const contexto = contextoDePerfil(perfil);
    expect(contexto).toContain("lo que ninguna función nueva puede olvidar");
    expect(contexto).toContain("coma decimal");
  });

  it("sumar agrega una viñeta sin pisar lo anterior, y lo repetido no entra dos veces", async () => {
    await sumarAlPerfil(repo, "Hay monotributistas Y responsables inscriptos");
    await sumarAlPerfil(repo, "El IVA se discrimina solo en la factura A");
    await sumarAlPerfil(repo, "Hay monotributistas Y responsables inscriptos"); // eco

    const perfil = await leerPerfil(repo);
    expect(perfil.split("\n")).toHaveLength(2);
    expect(perfil).toContain("- Hay monotributistas Y responsables inscriptos");
    expect(perfil).toContain("- El IVA se discrimina solo en la factura A");
  });

  it("es un archivo plano del repo: sin estado oculto", async () => {
    await sumarAlPerfil(repo, "una verdad del dominio");
    const crudo = await readFile(join(repo, ".dolphin", "PERFIL.md"), "utf8");
    expect(crudo).toContain("una verdad del dominio");
  });

  it("una línea vacía no enseña nada", async () => {
    await expect(sumarAlPerfil(repo, "   ")).rejects.toThrow();
  });

  it("una tarea nueva recibe el perfil ENTERO aunque no tenga nada que ver con él", async () => {
    // El caso que lo originó: le pedís una función nueva y el agente la
    // hace solo para monotributistas, porque nadie le recordó a los RI.
    await sumarAlPerfil(repo, "Hay monotributistas Y responsables inscriptos: todo lo nuevo cubre ambos (los RI discriminan IVA)");
    await recordar(repo, "los importes van con coma decimal, nunca con punto");
    await recordar(repo, "La exportación a CSV ya se cortó una vez por el separador", undefined, "error");

    const contexto = await contextoDeSiembra(repo, "Sumá un reporte de ventas del mes");

    expect(contexto).toContain("responsables inscriptos");
    expect(contexto).toContain("coma decimal"); // las reglas de la casa viajan siempre
    expect(contexto).not.toContain("CSV"); // lo aprendido, solo si la tarea se le parece
    // El perfil va primero: es lo que el agente tiene que leer antes que nada.
    expect(contexto.indexOf("responsables inscriptos")).toBeLessThan(contexto.indexOf("coma decimal"));
  });

  it("lo que pide quien siembra va entre el perfil y las reglas, y sin memoria no se inventa nada", async () => {
    expect(await contextoDeSiembra(repo, "lo que sea")).toBe("");
    expect(await contextoDeSiembra(repo, "lo que sea", "  usá la rama de staging  ")).toBe("usá la rama de staging");

    await sumarAlPerfil(repo, "una verdad del dominio");
    await recordar(repo, "una regla de la casa");
    const contexto = await contextoDeSiembra(repo, "lo que sea", "un pedido de hoy");
    const [perfil, pedido, reglas] = ["una verdad del dominio", "un pedido de hoy", "una regla de la casa"].map((t) =>
      contexto.indexOf(t),
    );
    expect(perfil).toBeLessThan(pedido!);
    expect(pedido).toBeLessThan(reglas!);
  });
});
