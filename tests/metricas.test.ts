import { describe, expect, it } from "vitest";
import { medir } from "../ui/src/lib/metricas.js";
import type { Turno } from "../ui/src/lib/tipos.js";

/**
 * Los números del tablero. «Se cortó gratis» habla del portón: una rama
 * que costó escribirla y murió en los tests no gastó un centavo en fases.
 */

describe("las métricas del tablero", () => {
  const turno = (intentos: NonNullable<Turno["intentos"]>): Turno => ({
    id: "t",
    tarea: "x",
    gastado: 0.5,
    ms: 1000,
    universos: intentos.length,
    vivos: intentos.filter((x) => x.vivo).length,
    ganador: null,
    intentos,
  });

  it("cortada gratis es la que el portón cortó sin gastar, aunque escribirla haya costado", () => {
    const m = medir([
      turno([
        { id: "u1", vivo: false, murioEn: "test", gastado: 0.3, gastadoFases: 0, fases: 1 },
        { id: "u2", vivo: false, murioEn: "revisión", gastado: 0.31, gastadoFases: 0.01, fases: 2 },
        // Un historial viejo, sin el dato aparte: cuenta lo que dice el total.
        { id: "u3", vivo: false, murioEn: "test", gastado: 0, fases: 1 },
      ]),
    ]);
    expect(m.cortadosGratis).toBe(2);
    // El gasto por modelo sí es el de la rama entera.
    expect(m.porModelo[0]!.gastado).toBeCloseTo(0.61);
  });
});
