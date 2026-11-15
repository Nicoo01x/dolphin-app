import { describe, expect, it } from "vitest";
import { aplicarEvento, estadoInicial, etapaActual, type EstadoTablero, type EventoConHora } from "../src/tablero/estado.js";
import { anchoVisible, ajustar, dibujarTablero } from "../src/tablero/dibujo.js";
import { SIMULACION_DESDE, siembraSimulada } from "../src/tablero/simulacion.js";

const T0 = SIMULACION_DESDE;

function armar(hasta?: number): EstadoTablero {
  const estado = estadoInicial(T0);
  for (const e of siembraSimulada(hasta)) aplicarEvento(estado, e);
  return estado;
}

describe("tablero de la terminal", () => {
  it("sigue a cada rama por su momento y la siembra por su etapa", () => {
    expect(etapaActual(armar(T0 + 1000))).toBe("escribir");
    const enPorton = armar(T0 + 8600);
    expect(etapaActual(enPorton)).toBe("porton")
    expect(enPorton.universos.get("u3")?.momento).toBe("cortada");
    expect(enPorton.universos.get("u2")?.momento).toBe("corrige");
    const final = armar();
    expect(etapaActual(final)).toBe("entregar");
    expect(final.universos.get("u1")?.momento).toBe("paso");
    expect(final.universos.get("u2")?.momento).toBe("paso");
    expect(final.universos.get("u2")?.porQue).toBeUndefined();
    expect(final.universos.get("u3")?.porQue).toContain("sintaxis");
  });

  it("entra en el ancho pedido y dice lo que importa", () => {
    const lineas = dibujarTablero(armar(), { ancho: 100, ahora: T0 + 12000, color: false });
    for (const l of lineas) expect(anchoVisible(l)).toBeLessThanOrEqual(100);
    const texto = lineas.join("\n");
    expect(texto).toContain("DOLPHIN · SIEMBRA · 3 RAMAS · CLAUDE");
    expect(texto).toContain("u1 · sonnet · ELEGIDA");
    expect(texto).toContain("portón · fase por fase");
    expect(texto).toContain("[x] cortada");
    expect(texto).toContain("elegida dolphin/abc/u1");
    expect(texto).toContain("gastado US$ 0.42");
  });

  it("con color, el ancho visible es el mismo que sin color", () => {
    const sin = dibujarTablero(armar(T0 + 9000), { ancho: 90, ahora: T0 + 9000, color: false });
    const con = dibujarTablero(armar(T0 + 9000), { ancho: 90, ahora: T0 + 9000, color: true });
    expect(con.map(anchoVisible)).toEqual(sin.map(anchoVisible));
  });

  it("ajustar recorta sin romper los colores", () => {
    const pintado = "\x1b[32mhola mundo largo\x1b[0m";
    const corto = ajustar(pintado, 6);
    expect(anchoVisible(corto)).toBe(6);
    expect(corto.endsWith("\x1b[0m")).toBe(true);
  });
});
