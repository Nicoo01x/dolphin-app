import { describe, expect, it } from "vitest";
import { referenciasEn, rotuloDe } from "./referencias";

/**
 * Los mismos casos que el detector del chat del escritorio
 * (`escritorio/src/renderer/src/components/dolphin/chat/referencias.test.ts`): los dos tienen que
 * marcar exactamente lo mismo sobre el mismo texto.
 */
const marcas = (texto: string, ramas?: readonly string[]): string[] =>
  referenciasEn(texto, ramas ? { ramas } : {}).map((r) => `${r.clase}:${r.id}`);

describe("las referencias de un texto", () => {
  it("encuentra un issue escrito con numeral", () => {
    expect(marcas("arreglá el #412 antes de mergear")).toEqual(["issue:412"]);
  });

  it("distingue un PR de un issue por la palabra", () => {
    expect(marcas("lo subí en el PR #45")).toEqual(["pr:45"]);
    expect(marcas("cerré el pull request 45")).toEqual(["pr:45"]);
  });

  it("un numeral pegado a algo no es un issue", () => {
    expect(marcas("el fondo es #0e1013 y la clase .tarea#4")).toEqual([]);
    expect(marcas("poné color #fff")).toEqual([]);
  });

  it("un issue escrito con GH- también cuenta", () => {
    expect(marcas("cerrado en GH-128")).toEqual(["issue:128"]);
  });

  it("encuentra un hash de commit pero no una palabra que parezca", () => {
    expect(marcas("rompió en 9f2c1e7")).toEqual(["commit:9f2c1e7"]);
    // Siete letras hexadecimales sin ningún dígito son una palabra.
    expect(marcas("quedó accede y bacteria")).toEqual([]);
  });

  it("una rama de Dolphin se reconoce sin consultar el repo", () => {
    expect(marcas("quedó en dolphin/4e2/u1")).toEqual(["rama:dolphin/4e2/u1"]);
  });

  it("la carpeta de trabajo de Dolphin no es una rama", () => {
    // Lo encontró la consola andando, no un test: la memoria nombra sus propios archivos.
    expect(marcas("se guarda en dolphin/dolphin.sqlite y en dolphin/latidos")).toEqual([]);
  });

  it("una rama cualquiera se marca solo si existe en el repo", () => {
    const ramas = ["master", "feat/dock-spotlight"];
    expect(marcas("pasá feat/dock-spotlight a master", ramas)).toEqual([
      "rama:feat/dock-spotlight",
      "rama:master",
    ]);
    expect(marcas("mirá feat/lo-que-sea", ramas)).toEqual([]);
  });

  it("una rama pegada a otra cosa no cuenta, y gana la más larga", () => {
    expect(marcas("origin/main y mainframe", ["main"])).toEqual([]);
    expect(marcas("subilo a main-viejo", ["main", "main-viejo"])).toEqual(["rama:main-viejo"]);
  });

  it("salen en orden y no se superponen", () => {
    const r = referenciasEn("el #10 del PR #11 en 9f2c1e7");
    expect(r.map((x) => x.clase)).toEqual(["issue", "pr", "commit"]);
    for (const [i, x] of r.entries()) {
      const previo = r[i - 1];
      if (previo) expect(x.desde).toBeGreaterThanOrEqual(previo.hasta);
    }
  });

  it("los índices apuntan al texto exacto que se marcó", () => {
    const texto = "cerrá el #412 ya";
    const [uno] = referenciasEn(texto);
    expect(texto.slice(uno!.desde, uno!.hasta)).toBe("#412");
  });

  it("el rótulo corta el hash y le pone el numeral al número", () => {
    expect(rotuloDe({ clase: "commit", texto: "abc1234def5678", id: "abc1234def5678" })).toBe("abc1234");
    expect(rotuloDe({ clase: "issue", texto: "GH-9", id: "9" })).toBe("#9");
    expect(rotuloDe({ clase: "rama", texto: "feat/x", id: "feat/x" })).toBe("feat/x");
  });
});
