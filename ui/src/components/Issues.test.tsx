import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { haceCuanto } from "@/lib/datos";
import { Issues } from "./Issues";

/**
 * La vista se arma en el servidor de React: alcanza para lo que importa acá —qué dice cada fila
 * antes de que lleguen los datos— sin montar un navegador. Lo que pasa después de un clic lo
 * cubren los tests de la consulta (lib/consulta.test.ts), que es donde vive esa lógica.
 */
describe("la vista de issues", () => {
  it("arranca pidiendo los abiertos, con el campo escrito como en GitHub", () => {
    const html = renderToStaticMarkup(<Issues alComenzar={() => {}} />);
    expect(html).toContain('value="is:open"');
    expect(html).toContain("Abiertos");
    expect(html).toContain("Cerrados");
    // «Asignados a mí» aparece solo cuando se sabe quién soy: sin sesión de gh no quiere decir nada.
    expect(html).not.toContain("Asignados a mí");
  });

  it("mientras carga muestra filas fantasma, no una lista vacía", () => {
    // El alto de la lista no cambia cuando llegan los issues: la grilla y el encabezado ya están.
    const html = renderToStaticMarkup(<Issues alComenzar={() => {}} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Título / contexto");
    expect(html).toContain("animate-pulse");
  });
});

describe("cuánto hace", () => {
  const ahora = new Date("2026-11-01T12:00:00Z");
  const hace = (ms: number) => haceCuanto(new Date(ahora.getTime() - ms).toISOString(), ahora);

  it("lo dice como una persona", () => {
    expect(hace(20_000)).toBe("recién");
    expect(hace(13 * 60_000)).toBe("hace 13 minutos");
    expect(hace(60 * 60_000)).toBe("hace 1 hora");
    expect(hace(5 * 3_600_000)).toBe("hace 5 horas");
    expect(hace(3 * 86_400_000)).toBe("hace 3 días");
    expect(hace(40 * 86_400_000)).toBe("hace 1 mes");
    expect(hace(400 * 86_400_000)).toBe("hace 1 año");
  });

  it("un reloj adelantado no deja «hace -3 minutos»", () => {
    expect(haceCuanto(new Date(ahora.getTime() + 600_000).toISOString(), ahora)).toBe("recién");
  });

  it("sin fecha, o con una que no se entiende, no inventa nada", () => {
    expect(haceCuanto(undefined)).toBe("");
    expect(haceCuanto("cuando sea")).toBe("");
  });
});
