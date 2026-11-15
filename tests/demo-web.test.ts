import { describe, expect, it } from "vitest";
import { siembraSimulada, SIMULACION_DESDE } from "../src/tablero/simulacion.js";
import { comoVa, DURACION, enElMomento, GUION, TAREA } from "../web/src/lib/demo.js";

/**
 * La demo de la web cuenta la MISMA siembra que `dolphin tablero --demo` en la terminal.
 *
 * El guion está copiado (la web es otro proyecto, con su propio build, y no importa del núcleo),
 * así que sin este test las dos versiones se irían separando sin que nadie se entere: la web
 * terminaría mostrando una siembra que el producto ya no hace, que es exactamente lo que el
 * catálogo de funciones evita diciendo en qué archivo vive cada cosa.
 */

describe("la demo de la web y la de la terminal cuentan lo mismo", () => {
  const dela = siembraSimulada().map((e) => ({ ...e, t: e.t - SIMULACION_DESDE }));

  it("la tarea es la misma", () => {
    const siembra = dela.find((e) => e.tipo === "siembra");
    expect(siembra && "tarea" in siembra ? siembra.tarea : "").toBe(TAREA);
  });

  it("los momentos coinciden uno a uno: cuándo, qué rama y qué pasó", () => {
    // Los tipos que las dos versiones cuentan (la de la terminal tiene además «siembra», que en
    // la web es el encabezado, y costos de fase que la web no dibuja).
    const comparables = dela.filter((e) => e.tipo !== "siembra");
    expect(GUION).toHaveLength(comparables.length);

    for (const [i, evento] of comparables.entries()) {
      const nuestro = GUION[i]!;
      expect({ t: nuestro.t, tipo: nuestro.tipo }).toEqual({ t: evento.t, tipo: evento.tipo });
      if ("u" in evento && "u" in nuestro) expect(nuestro.u).toBe(evento.u);
      if (evento.tipo === "veredicto" && nuestro.tipo === "veredicto") {
        expect(nuestro.fase).toBe(evento.verificador);
        expect(nuestro.paso).toBe(evento.paso);
        if (evento.detalle) expect(nuestro.detalle).toBe(evento.detalle);
      }
      if (evento.tipo === "escribio" && nuestro.tipo === "escribio") {
        expect({ a: nuestro.archivos, m: nuestro.modelo }).toEqual({ a: evento.archivos, m: evento.modelo });
      }
    }
  });

  it("la película dura lo que dura la siembra simulada", () => {
    expect(DURACION).toBe(Math.max(...dela.map((e) => e.t)));
  });
});

describe("el estado de la demo en cada instante", () => {
  it("al principio no hay nada", () => {
    expect(enElMomento(0).ramas).toEqual([]);
    expect(comoVa(enElMomento(0))).toBe("arrancando…");
  });

  it("las tres nacen escribiendo", () => {
    const estado = enElMomento(200);
    expect(estado.ramas.map((r) => r.id)).toEqual(["u1", "u2", "u3"]);
    expect(estado.ramas.every((r) => r.celdas.escribe === "haciendo")).toBe(true);
    expect(comoVa(estado)).toContain("3 escribiendo");
  });

  it("la que rebota en sintaxis queda cortada, con su motivo", () => {
    const u3 = enElMomento(5400).ramas.find((r) => r.id === "u3")!;
    expect(u3.celdas.sintaxis).toBe("corta");
    expect(u3.viva).toBe(false);
    expect(u3.porQue).toBe("Unexpected token");
  });

  it("la que corrige vuelve a estar en juego y después pasa", () => {
    const corrigiendo = enElMomento(8600).ramas.find((r) => r.id === "u2")!;
    expect(corrigiendo.celdas.test).toBe("corrigiendo");
    expect(corrigiendo.viva).toBe(true);
    expect(enElMomento(11100).ramas.find((r) => r.id === "u2")!.celdas.test).toBe("paso");
  });

  it("volver atrás no deja nada de la pasada anterior", () => {
    // Se recalcula entero desde el guion: mirar el final y después el principio da el principio.
    enElMomento(DURACION);
    expect(enElMomento(200).ramas.every((r) => r.celdas.sintaxis === "nada")).toBe(true);
  });

  it("al final se dice quién ganó y por qué", () => {
    const estado = enElMomento(DURACION);
    expect(estado.cosecha?.elegida).toBe("dolphin/abc/u1");
    expect(comoVa(estado)).toContain("2 de 3 pasaron el portón");
    expect(comoVa(estado)).toContain("el diff más chico");
  });
});
