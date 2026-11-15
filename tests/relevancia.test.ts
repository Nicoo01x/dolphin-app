import { describe, expect, it } from "vitest";
import { relevanciaDeMemoria, type TareaParaRelevancia } from "../src/nucleo/relevancia.js";
import type { Memoria } from "../src/nucleo/memoria.js";

const recuerdo = (id: string, dicho: string, extra: Partial<Memoria["recuerdos"][number]> = {}) => ({
  id,
  dicho,
  creado: "2026-10-26T00:00:00.000Z",
  activo: true,
  ...extra,
});

describe("relevancia de memoria", () => {
  it("pone arriba lo que comparte materia y pesa más la ruta", () => {
    const tarea: TareaParaRelevancia = { texto: "arreglá la exportación", rutas: ["src/exportacion/csv.ts"] };
    const resultado = relevanciaDeMemoria(tarea, {
      recuerdos: [
        recuerdo("lejos", "El deploy usa tags firmados", { tipo: "decision" }),
        recuerdo("cerca", "La exportación CSV se corta en src/exportacion/csv.ts", { tipo: "error" }),
      ],
    });

    expect(resultado.map((r) => r.recuerdo.id)).toEqual(["cerca"]);
    expect(resultado[0]!.puntaje).toBeGreaterThan(0);
  });

  it("respeta el tope de tokens y deja entrar siempre los patrones", () => {
    const resultado = relevanciaDeMemoria("arreglá el carrito", {
      recuerdos: [
        recuerdo("largo", "carrito " + "detalle ".repeat(30)),
        recuerdo("patron", "No uses console.log", { patron: "console\\.log" }),
      ],
    }, { topeTokens: 3 });

    expect(resultado.map((r) => r.recuerdo.id)).toContain("patron");
    expect(resultado.filter((r) => !r.forzada).reduce((suma, r) => suma + r.tokens, 0)).toBeLessThanOrEqual(3);
  });

  it("premia los errores y el uso frecuente cuando la materia es la misma", () => {
    const resultado = relevanciaDeMemoria("arreglá el IVA", {
      recuerdos: [
        recuerdo("regla", "El IVA se redondea una vez"),
        recuerdo("error", "El IVA se redondea dos veces", { tipo: "error" }),
      ],
    }, { usos: { error: { usos: 8 }, regla: { usos: 0 } } });

    expect(resultado[0]!.recuerdo.id).toBe("error");
  });
});
