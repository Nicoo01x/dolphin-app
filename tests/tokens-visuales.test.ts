import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BASE_OSCURA, ESTADOS, FORMA, SUPERFICIES, TOKENS_COMPARTIDOS, tokensDeclarados, type NombreDeToken } from "../src/nucleo/tokens-visuales.js";

/**
 * La consola y el escritorio dicen lo mismo.
 *
 * Este test existe para que la próxima divergencia se vea en el momento en que se escribe y no
 * seis meses después, cuando la misma rama se lee de dos colores distintos según dónde la mires.
 * Si hay que cambiar un color, se cambia en `src/nucleo/tokens-visuales.ts` y en los dos CSS.
 */

const raiz = join(import.meta.dirname, "..");
const leer = (archivo: string) => readFile(join(raiz, archivo), "utf8");

describe("un solo sistema visual", () => {
  it("las dos superficies declaran los tokens compartidos con el mismo valor", async () => {
    const diferencias: string[] = [];
    for (const superficie of SUPERFICIES) {
      const css = await leer(superficie.archivo);
      const porSelector = [
        { tokens: { ...BASE_OSCURA, ...ESTADOS }, declarados: tokensDeclarados(css, superficie.oscuro) },
        { tokens: FORMA, declarados: tokensDeclarados(css, superficie.raiz) },
      ];
      for (const { tokens, declarados } of porSelector) {
        for (const [nombre, valor] of Object.entries(tokens)) {
          const suyo = declarados.get(nombre);
          if (suyo === undefined) {
            diferencias.push(`${superficie.nombre} no declara --${nombre} (tendría que decir ${valor})`);
          } else if (suyo !== valor) {
            diferencias.push(`${superficie.nombre} dice --${nombre}: ${suyo} y la fuente dice ${valor}`);
          }
        }
      }
    }
    // Todas juntas y no la primera: con una por corrida, unificar cinco colores son cinco vueltas.
    expect(diferencias).toEqual([]);
  });

  it("el parser lee el bloque del selector y no el de al lado", () => {
    const css = [":root {", "  --background: #fff;", "  --radius: 1px;", "}", ".dark {", "  --background: #000;", "}"].join("\n");
    expect(tokensDeclarados(css, ":root").get("background")).toBe("#fff");
    expect(tokensDeclarados(css, ".dark").get("background")).toBe("#000");
    expect(tokensDeclarados(css, ".dark").has("radius")).toBe(false);
  });

  it("también lee un selector que encabeza una lista", () => {
    const css = [".dark,", ".otra-cosa {", "  --paso: #5fb07c;", "}"].join("\n");
    expect(tokensDeclarados(css, ".dark").get("paso")).toBe("#5fb07c");
  });

  it("no se cuelga con un valor que trae llaves o funciones adentro", () => {
    const css = [".dark {", "  --vidrio: color-mix(in srgb, var(--card) 72%, transparent);", "  --paso: #5fb07c;", "}"].join("\n");
    const leidos = tokensDeclarados(css, ".dark");
    expect(leidos.get("vidrio")).toBe("color-mix(in srgb, var(--card) 72%, transparent)");
    expect(leidos.get("paso")).toBe("#5fb07c");
  });

  it("si una superficie cambia un color por su cuenta, el test lo canta", async () => {
    // La prueba del test: con el CSS de la consola y un valor cambiado a mano, tiene que diferir.
    const css = (await leer("ui/src/app.css")).replace("--paso: #5fb07c;", "--paso: #00ff00;");
    const declarados = tokensDeclarados(css, ":root");
    expect(declarados.get("paso")).not.toBe(TOKENS_COMPARTIDOS["paso" as NombreDeToken]);
  });
});
