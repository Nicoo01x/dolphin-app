import { describe, expect, it } from "vitest";
import { horaCorta, momentoDe, resumenDe, seccionDe, seccionesDe } from "../ui/src/lib/secciones.js";
import type { Turno } from "../ui/src/lib/tipos.js";

/**
 * La barra lateral por secciones: lo de hoy arriba, y una tarea es UNA
 * entrada aunque se haya sembrado cinco veces.
 */

// Mediodía local: lejos de la medianoche, así ningún huso horario corre el día.
const ahora = new Date(2026, 9, 21, 12, 0, 0);
const haceDias = (dias: number, hora = 10) =>
  new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - dias, hora, 30).toISOString();

let n = 0;
const turno = (tarea: string, cuando: string | undefined, extra: Partial<Turno> = {}): Turno => ({
  id: `t${++n}`,
  tarea,
  ...(cuando ? { cuando } : {}),
  gastado: 0.01,
  ms: 41_000,
  universos: 1,
  vivos: 1,
  ganador: "u1",
  ...extra,
});

describe("las secciones de la barra", () => {
  it("cada fecha cae en su sección de calendario", () => {
    expect(seccionDe(haceDias(0), ahora)).toBe("Hoy");
    expect(seccionDe(haceDias(1, 23), ahora)).toBe("Ayer");
    expect(seccionDe(haceDias(3), ahora)).toBe("Últimos 7 días");
    expect(seccionDe(haceDias(12), ahora)).toBe("Últimos 30 días");
    expect(seccionDe(haceDias(90), ahora)).toBe("Antes");
  });

  it("sin fecha o con una fecha rota va a «Antes»; una del futuro, a «Hoy»", () => {
    expect(seccionDe(undefined, ahora)).toBe("Antes");
    expect(seccionDe("no es una fecha", ahora)).toBe("Antes");
    expect(seccionDe(haceDias(-2), ahora)).toBe("Hoy");
  });

  it("la misma tarea sembrada varias veces es UNA entrada, con sus corridas de la más nueva a la más vieja", () => {
    const secciones = seccionesDe(
      [
        turno("Arreglá el IVA", haceDias(0, 9)),
        turno("Sumale el CSV", haceDias(0, 10)),
        turno("arreglá   el IVA ", haceDias(0, 11)), // otra mayúscula y otros espacios: la misma
        turno("Arreglá el IVA", haceDias(0, 8)),
      ],
      ahora,
    );

    expect(secciones).toHaveLength(1);
    const [hoy] = secciones;
    expect(hoy!.titulo).toBe("Hoy");
    expect(hoy!.entradas.map((e) => e.corridas.length)).toEqual([3, 1]);

    const iva = hoy!.entradas[0]!;
    const horas = iva.corridas.map((t) => new Date(t.cuando!).getHours());
    expect(horas).toEqual([11, 9, 8]);
  });

  it("una tarea vive en la sección de su corrida más nueva, aunque haya corrido antes", () => {
    const secciones = seccionesDe(
      [turno("Arreglá el IVA", haceDias(5)), turno("Arreglá el IVA", haceDias(0)), turno("Otra cosa", haceDias(5))],
      ahora,
    );
    expect(secciones.map((s) => s.titulo)).toEqual(["Hoy", "Últimos 7 días"]);
    expect(secciones[0]!.entradas[0]!.corridas).toHaveLength(2);
    expect(secciones[1]!.entradas.map((e) => e.tarea)).toEqual(["Otra cosa"]);
  });

  it("las secciones salen en orden de calendario y las vacías no aparecen", () => {
    const secciones = seccionesDe(
      [turno("vieja", haceDias(200)), turno("de ayer", haceDias(1)), turno("sin fecha", undefined)],
      ahora,
    );
    expect(secciones.map((s) => s.titulo)).toEqual(["Ayer", "Antes"]);
    expect(secciones[1]!.entradas.map((e) => e.tarea)).toEqual(["vieja", "sin fecha"]);
  });

  it("sin corridas no hay secciones", () => {
    expect(seccionesDe([], ahora)).toEqual([]);
  });

  it("la hora corta no repite el día que ya dice la sección", () => {
    expect(horaCorta(haceDias(0, 9), "Hoy")).toBe("09:30");
    expect(horaCorta(haceDias(12), "Últimos 30 días")).toMatch(/^\d{2}\/\d{2}$/);
    expect(horaCorta(undefined, "Antes")).toBe("");
  });

  it("una corrida anidada dice su propio día, porque puede no ser el de la sección", () => {
    expect(momentoDe(haceDias(0, 9), ahora)).toBe("09:30");
    expect(momentoDe(haceDias(1, 9), ahora)).toBe("ayer 09:30");
    expect(momentoDe(haceDias(40, 9), ahora)).toMatch(/^\d{2}\/\d{2} 09:30$/);
    expect(momentoDe(undefined, ahora)).toBe("");
  });

  it("con una sola rama el resultado se dice sin contar, y sin fases no se dice «probada»", () => {
    expect(resumenDe(turno("x", undefined, { universos: 1, vivos: 1, intentos: [{ id: "u1", vivo: true, gastado: 0, fases: 0 }] }))).toBe(
      "sin probar",
    );
    expect(resumenDe(turno("x", undefined, { universos: 1, vivos: 1 }))).toBe("probada");
    expect(resumenDe(turno("x", undefined, { universos: 1, vivos: 0 }))).toBe("se cortó");
    expect(resumenDe(turno("x", undefined, { universos: 6, vivos: 2 }))).toBe("2 de 6 pasaron");
    // Una siembra que no abrió ninguna rama no «pasó 0 de 0»: no tuvo ramas.
    expect(resumenDe(turno("x", undefined, { universos: 0, vivos: 0 }))).toBe("sin ramas");
  });
});
