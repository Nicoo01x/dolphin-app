// La cola de lo que escribís mientras el agente trabaja. Lo que importa: que no se pierda nada,
// que no se mande dos veces lo mismo, y que cuando no entran todos lo diga en vez de esconderlos.

import { describe, expect, it } from "vitest";
import { ColaDeMensajes, renglonesDeLaCola, TOPE_DE_LA_COLA } from "../src/tui/cola-de-mensajes.js";

describe("la cola de mensajes", () => {
  it("guarda en orden y los suelta juntos en un solo pedido", () => {
    const cola = new ColaDeMensajes();
    expect(cola.encolar("primero", 1)).toBe(true);
    expect(cola.encolar("segundo", 2)).toBe(true);
    expect(cola.pendientes.map((x) => x.texto)).toEqual(["primero", "segundo"]);
    expect(cola.soltar()).toBe("primero\nsegundo");
    expect(cola.hay).toBe(false);
  });

  it("soltar una cola vacía no manda un mensaje vacío", () => {
    expect(new ColaDeMensajes().soltar()).toBeNull();
  });

  it("un Enter de más no encola nada", () => {
    const cola = new ColaDeMensajes();
    expect(cola.encolar("   ", 1)).toBe(false);
    expect(cola.encolar("", 1)).toBe(false);
    expect(cola.hay).toBe(false);
  });

  it("un Enter doble por nervios no manda la misma cosa dos veces", () => {
    const cola = new ColaDeMensajes();
    expect(cola.encolar("arreglá el login", 1)).toBe(true);
    expect(cola.encolar("arreglá el login", 2)).toBe(false);
    expect(cola.pendientes).toHaveLength(1);
  });

  it("pero lo mismo pedido de nuevo más tarde sí entra", () => {
    const cola = new ColaDeMensajes();
    cola.encolar("probá", 1);
    cola.encolar("otra cosa", 2);
    expect(cola.encolar("probá", 3)).toBe(true);
    expect(cola.pendientes).toHaveLength(3);
  });

  it("se guarda el texto recortado, no lo que quedó con espacios", () => {
    const cola = new ColaDeMensajes();
    cola.encolar("  con espacios  ", 1);
    expect(cola.soltar()).toBe("con espacios");
  });

  it("tiene tope: una cola infinita es trabajo que nadie recuerda haber pedido", () => {
    const cola = new ColaDeMensajes();
    for (let i = 0; i < TOPE_DE_LA_COLA; i++) expect(cola.encolar(`pedido ${i}`, i)).toBe(true);
    expect(cola.encolar("uno más", 99)).toBe(false);
    expect(cola.pendientes).toHaveLength(TOPE_DE_LA_COLA);
  });

  it("se puede tachar uno antes de que salga", () => {
    const cola = new ColaDeMensajes();
    cola.encolar("a", 1);
    cola.encolar("b", 2);
    cola.encolar("c", 3);
    expect(cola.quitar(1)).toBe(true);
    expect(cola.soltar()).toBe("a\nc");
  });

  it("tachar algo que no está no rompe nada", () => {
    const cola = new ColaDeMensajes();
    cola.encolar("a", 1);
    expect(cola.quitar(5)).toBe(false);
    expect(cola.quitar(-1)).toBe(false);
    expect(cola.pendientes).toHaveLength(1);
  });

  it("vaciar tira lo guardado sin mandarlo", () => {
    const cola = new ColaDeMensajes();
    cola.encolar("a", 1);
    cola.vaciar();
    expect(cola.soltar()).toBeNull();
  });
});

describe("cómo se lee la cola arriba del prompt", () => {
  const unos = (n: number) => Array.from({ length: n }, (_, i) => ({ texto: `p${i}`, t: i }));

  it("si entran todos, se ven todos", () => {
    expect(renglonesDeLaCola(unos(3), 5).map((x) => x.texto)).toEqual(["p0", "p1", "p2"]);
  });

  it("si no entran, dice cuántos quedaron afuera y muestra los últimos", () => {
    expect(renglonesDeLaCola(unos(6), 3).map((x) => x.texto)).toEqual(["+4 esperando", "p4", "p5"]);
  });

  it("sin lugar no se dibuja nada, y con la cola vacía tampoco", () => {
    expect(renglonesDeLaCola(unos(3), 0)).toEqual([]);
    expect(renglonesDeLaCola([], 5)).toEqual([]);
  });

  it("con lugar para uno solo, ese uno dice cuántos hay", () => {
    expect(renglonesDeLaCola(unos(4), 1).map((x) => x.texto)).toEqual(["+4 esperando"]);
  });
});
