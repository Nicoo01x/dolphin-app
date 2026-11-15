import { describe, expect, it } from "vitest";
import { adentro, cuadroDelDelfin, delfinComoTexto, poligonosDelTrazo } from "../src/tui/delfin.js";

describe("el delfín de la terminal", () => {
  it("lee el trazo del logo y sabe qué queda adentro", () => {
    const cuadrado = poligonosDelTrazo("M0 0L10 0L10 10L0 10Z");
    expect(cuadrado).toHaveLength(1);
    expect(adentro(cuadrado, 5, 5)).toBe(true);
    expect(adentro(cuadrado, 15, 5)).toBe(false);
  });

  it("cada cuadro tiene el tamaño pedido, mar abajo y delfín en el aire", () => {
    const cuadro = cuadroDelDelfin(2100, 60, 16);
    expect(cuadro).toHaveLength(16);
    expect(cuadro.every((fila) => fila.length === 60)).toBe(true);
    const tintas = new Set(cuadro.flat().map((c) => c.tinta));
    expect(tintas.has(3)).toBe(true); // delfín
    expect(tintas.has(2)).toBe(true); // espuma de las olas
  });

  it("se mueve: dos instantes distintos no dibujan lo mismo", () => {
    expect(delfinComoTexto(800, 60, 16, false).join("\n")).not.toBe(delfinComoTexto(1600, 60, 16, false).join("\n"));
  });

  it("sin color no deja secuencias ANSI", () => {
    expect(delfinComoTexto(1200, 40, 10, false).join("")).not.toContain("\x1b[");
  });
});
