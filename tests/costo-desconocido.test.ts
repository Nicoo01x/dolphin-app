import { describe, expect, it } from "vitest";
import { costoEnPalabras, htmlDelParte, tokensEnPalabras } from "../src/nucleo/parte.js";
import { sembrar } from "../src/nucleo/sembrar.js";
import { FalloDelAgente, type Agente, type Taller } from "../src/nucleo/tipos.js";

/**
 * Codex y Antigravity corren con la cuenta de la persona (ChatGPT, Google)
 * y no informan plata: informan tokens. Un 0 en su lugar los hacía pasar
 * por gratis —el más barato de la tabla, «muertos gratis» que costaron, un
 * tope de presupuesto que nunca corta—. Lo que no se sabe se dice.
 */

const taller: Taller = {
  async abrir(id, rama) {
    return { id, rama: `${rama}/${id}`, ruta: `/juguete/${id}`, nacido: 0 };
  },
  async cerrar() {},
};
const forma = { archivos: 1, agregadas: 2, quitadas: 0, dependenciasNuevas: 0 };

describe("una siembra con un motor que no informa su costo", () => {
  it("la rama y la cosecha lo dicen, los tokens se suman, y el que se cae sin informar no muere «gratis»", async () => {
    const arreglados = new Set<string>();
    const agente: Agente = {
      nombre: "codex",
      async trabajar(u) {
        if (u.id === "u3") throw new FalloDelAgente("no tocó ningún archivo: contestó en vez de trabajar", 0, true);
        return { forma, gastado: 0, costoDesconocido: true, tokens: { entrada: 20000, salida: 800, cache: 12000 }, modelo: "codex" };
      },
      async corregir(u) {
        arreglados.add(u.id);
        return { forma, gastado: 0, costoDesconocido: true, tokens: { entrada: 5000, salida: 200 }, modelo: "codex" };
      },
    };
    const cosecha = await sembrar({
      tarea: "sumá descuento",
      cantidad: 3,
      rama: "dolphin",
      taller,
      agente,
      reintentos: 1,
      verificadores: [
        {
          nombre: "test",
          costo: "gratis",
          async correr(u) {
            const paso = u.id === "u2" || arreglados.has(u.id);
            return { paso, detalle: paso ? "test: pasa" : "test: ✖ falta el tope", gastado: 0 };
          },
        },
        { nombre: "revisión", costo: "barato", async correr() { return { paso: true, detalle: "revisión: bien", gastado: 0.01 }; } },
      ],
    });

    const [u1, u2, u3] = cosecha.candidatos;
    // u1 escribió y corrigió: los tokens de las dos vueltas, juntos.
    expect(u1).toMatchObject({ vivo: true, costoDesconocido: true, tokens: { entrada: 25000, salida: 1000, cache: 12000 } });
    expect(u1!.correcciones).toEqual([expect.objectContaining({ fase: "test", gastado: 0, costoDesconocido: true })]);
    expect(u2).toMatchObject({ vivo: true, costoDesconocido: true, tokens: { entrada: 20000, salida: 800, cache: 12000 } });
    // u3 se cayó escribiendo: Codex corrió, así que no se puede decir que murió gratis.
    expect(u3).toMatchObject({ vivo: false, murioEn: "el agente", costoDesconocido: true });
    expect(cosecha.muertosGratis).toBe(0);
    // Lo que sí se sabe es la revisión de Claude: el total es un piso, y la cosecha lo dice.
    expect(cosecha.gastado).toBe(0.02);
    expect(cosecha.costoDesconocido).toBe(true);

    const html = htmlDelParte({ cosecha, cuando: "2026-10-22T07:00:00.000Z", repo: "/juguete" });
    expect(html).toContain("costó al menos US$ 0,02");
    expect(html).toContain("Codex y Antigravity no informan cuánto cuesta lo que escriben");
    // Los tokens de la elegida, en voz humana.
    expect(html).toContain(`<dt>tokens</dt><dd>${tokensEnPalabras(cosecha.ganador!.tokens!)}</dd>`);
    expect(html).not.toContain("costó US$ 0,02");
  });

  it("las palabras: nunca un cero inventado", () => {
    expect(costoEnPalabras(0.19)).toBe("costó US$ 0,19");
    expect(costoEnPalabras(0.02, true)).toBe("costó al menos US$ 0,02");
    expect(costoEnPalabras(0, true)).toBe("costo sin informar");
    expect(tokensEnPalabras({ entrada: 6831, salida: 26 })).toBe("6.831 de entrada · 26 de salida");
  });
});
