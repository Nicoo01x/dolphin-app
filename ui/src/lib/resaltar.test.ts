import { describe, expect, it } from "vitest";
import { lenguajeDe, resaltar, type ClaseDeToken, type Lenguaje } from "./resaltar";

/** Lo que salió, pegado: tiene que ser siempre la línea que entró. */
const pegado = (linea: string, lenguaje: Lenguaje = "ts") =>
  resaltar(linea, lenguaje)
    .map((t) => t.texto)
    .join("");

/** La clase con la que quedó un pedazo del texto. */
const claseDe = (linea: string, pedazo: string, lenguaje: Lenguaje = "ts"): ClaseDeToken | undefined =>
  resaltar(linea, lenguaje).find((t) => t.texto === pedazo)?.clase;

describe("el resaltado del diff", () => {
  it("nunca cambia el texto, que es lo único que no se puede romper", () => {
    const lineas = [
      "  const x = 1;",
      "export function hola(a: string): void {}",
      '  const s = "con \\" adentro y // esto no es comentario";',
      "const sinCerrar = 'se quedó abierta",
      "\t\tif (a && b) return;   ",
      "// solo un comentario",
      "",
      "   ",
      "const emoji = '🐬 ñandú';",
    ];
    for (const l of lineas) {
      for (const lenguaje of ["ts", "py", "css", "json", "md", "sh", "ninguno"] as const) {
        expect(pegado(l, lenguaje), `${lenguaje}: ${l}`).toBe(l);
      }
    }
  });

  it("la indentación se conserva tal cual", () => {
    expect(resaltar("    const x = 1", "ts")[0]?.texto).toBe("    ");
  });

  it("distingue lo que hay que distinguir en TypeScript", () => {
    const linea = "export const TOPE = contar(Usuario.nombre, 42) // listo";
    expect(claseDe(linea, "export")).toBe("palabra");
    expect(claseDe(linea, "const")).toBe("palabra");
    expect(claseDe(linea, "TOPE")).toBe("constante");
    expect(claseDe(linea, "contar")).toBe("funcion");
    expect(claseDe(linea, "Usuario")).toBe("tipo");
    expect(claseDe(linea, "nombre")).toBe("propiedad");
    expect(claseDe(linea, "42")).toBe("numero");
    expect(claseDe(linea, "// listo")).toBe("comentario");
  });

  it("una letra sola en mayúscula es un genérico, no una constante", () => {
    expect(claseDe("function uno<T>(x: T): T {}", "T")).toBe("tipo");
    expect(claseDe("const MAX_ALTO = 3", "MAX_ALTO")).toBe("constante");
  });

  it("una cadena se come lo que parezca código adentro", () => {
    const tokens = resaltar('const s = "const x = 1 // no";', "ts");
    expect(tokens.find((t) => t.clase === "cadena")?.texto).toBe('"const x = 1 // no"');
    expect(tokens.some((t) => t.clase === "comentario")).toBe(false);
  });

  it("un comentario se come lo que parezca una cadena", () => {
    const tokens = resaltar('// ojo con el " de acá', "ts");
    expect(tokens).toEqual([{ texto: '// ojo con el " de acá', clase: "comentario" }]);
  });

  it("cada lenguaje con su comentario", () => {
    expect(claseDe("x = 1  # nota", "# nota", "py")).toBe("comentario");
    expect(claseDe("select 1 -- nota", "-- nota", "sql")).toBe("comentario");
    // En TypeScript el numeral no es comentario: es un campo privado.
    expect(resaltar("this.#cuenta", "ts").some((t) => t.clase === "comentario")).toBe(false);
  });

  it("en Markdown se marca el título, el link y lo que va en ticks", () => {
    expect(resaltar("## Qué hay hoy", "md")).toEqual([{ texto: "## Qué hay hoy", clase: "tipo" }]);
    expect(claseDe("usá `npm test` para correrlo", "`npm test`", "md")).toBe("cadena");
    expect(claseDe("ver [la doc](http://x) ahí", "[la doc](http://x)", "md")).toBe("funcion");
  });

  it("el lenguaje sale del archivo, y lo que no se conoce va sin color", () => {
    expect(lenguajeDe("src/nucleo/porton.ts")).toBe("ts");
    expect(lenguajeDe("web/src/components/Portada.tsx")).toBe("ts");
    expect(lenguajeDe("D:\\repo\\estilos\\app.css")).toBe("css");
    expect(lenguajeDe("Dockerfile")).toBe("sh");
    expect(lenguajeDe(".env.example")).toBe("sh");
    expect(lenguajeDe("README.md")).toBe("md");
    expect(lenguajeDe("foto.png")).toBe("ninguno");
    expect(resaltar("lo que sea", "ninguno")).toEqual([{ texto: "lo que sea", clase: "normal" }]);
  });

  it("pedazos seguidos de la misma clase se juntan", () => {
    // Un token por carácter en los espacios y la puntuación serían cientos de nodos por línea.
    const tokens = resaltar("const a = 1", "ts");
    expect(tokens.length).toBeLessThan(8);
  });
});
