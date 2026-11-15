import { describe, expect, it } from "vitest";
import { partirEnInsignias } from "../ui/src/lib/insignias.js";

/** Los textos de los agentes, con lo que es un dato como insignia. */

const insignias = (texto: string) =>
  partirEnInsignias(texto)
    .filter((t) => t.tipo !== "texto")
    .map((t) => `${t.tipo}:${t.valor}`);

describe("las insignias de un texto", () => {
  it("el párrafo de la idea del 23/10: porcentajes y plata salen como datos", () => {
    const texto =
      "Eligió mejor que los baselines (40,6 % contra 37,1 % en Best@16 de SWE-Bench Verified) y salió más barato que correr tests agénticos (US$ 0,29 contra 0,52 por instancia).";
    // El otro lado de una comparación hereda la insignia aunque no traiga unidad.
    expect(insignias(texto)).toEqual(["dato:40,6 %", "dato:37,1 %", "dato:US$ 0,29", "dato:0,52"]);
  });

  it("un número sin unidad no es insignia, uno con unidad sí", () => {
    expect(insignias("genera 5 a 8 criterios con peso 1 a 3")).toEqual([]);
    expect(insignias("tardó 12 s y escribió 3 ramas en 180ms")).toEqual(["dato:12 s", "dato:3 ramas", "dato:180ms"]);
    // «s» de una palabra no es una unidad.
    expect(insignias("puntúa cada 2 sobrevivientes")).toEqual([]);
  });

  it("un rango va entero y no se lee como un número negativo", () => {
    expect(insignias("tarda 5-10 min y pesa 2–3 MB")).toEqual(["dato:5-10 min", "dato:2–3 MB"]);
    expect(insignias("bajó -3 % y v2-10 s")).toEqual(["dato:-3 %", "dato:10 s"]);
  });

  it("código, archivos, banderas y términos citados", () => {
    expect(insignias("Corré `npm run smoke` y mirá src/nucleo/porton.ts con --json")).toEqual([
      "codigo:npm run smoke",
      "codigo:src/nucleo/porton.ts",
      "codigo:--json",
    ]);
    expect(insignias("Agregar un escalón «criterio» después del package.json")).toEqual([
      "cita:criterio",
      "codigo:package.json",
    ]);
  });

  it("los modelos van con su nombre para llevar el logo", () => {
    expect(insignias("Un solo llamado a Claude genera; Haiku revisa y GPT-5.4 no entra")).toEqual([
      "modelo:Claude",
      "modelo:Haiku",
      "modelo:GPT-5.4",
    ]);
  });

  it("pegados, los trozos devuelven el texto (sin las comillas de las citas ni del código)", () => {
    const texto = "Con «criterio» y `x` cuesta US$ 1,20 en 3 min.";
    expect(partirEnInsignias(texto).map((t) => t.valor).join("")).toBe("Con criterio y x cuesta US$ 1,20 en 3 min.");
    expect(partirEnInsignias("")).toEqual([]);
    expect(partirEnInsignias("nada que marcar")).toEqual([{ tipo: "texto", valor: "nada que marcar" }]);
  });
});
