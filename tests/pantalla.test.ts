import { describe, expect, it } from "vitest";
import { armarVeredicto, superficiesAProbar, type InformeDePantalla } from "../src/tester/pantalla.js";
import { cruzarPorton } from "../src/nucleo/porton.js";
import { personasPorNombre, PERSONAS } from "../src/tester/personas.js";

describe("personas", () => {
  it("sin pedir ninguna, miran todas", () => {
    expect(personasPorNombre([])).toHaveLength(PERSONAS.length);
  });

  it("se pueden pedir por nombre y se ignora lo que no existe", () => {
    const elegidas = personasPorNombre(["pulgar", "no-existe", " teclado "]);
    expect(elegidas.map((p) => p.nombre)).toEqual(["pulgar", "teclado"]);
  });

  it("la persona del celular mira el tamaño del target y la del teclado no", () => {
    const pulgar = personasPorNombre(["pulgar"])[0]!;
    const teclado = personasPorNombre(["teclado"])[0]!;
    expect(pulgar.mira).toContain("target-chico");
    expect(teclado.mira).not.toContain("target-chico");
    expect(teclado.mira).toContain("foco-visible");
  });
});

describe("el veredicto de pantalla", () => {
  const limpio: InformeDePantalla[] = [
    { persona: "pulgar", hallazgos: [] },
    { persona: "teclado", hallazgos: [] },
  ];

  it("pasa cuando nadie encontró nada", () => {
    const v = armarVeredicto(limpio, 0);
    expect(v.paso).toBe(true);
    expect(v.detalle).toContain("nada roto");
    expect(v.gastado).toBe(0);
  });

  it("nunca cuesta un token: es un escalón gratis", () => {
    const v = armarVeredicto(
      [{ persona: "pulgar", hallazgos: [{ tipo: "desborde", donde: "x", detalle: "y" }] }],
      0,
    );
    expect(v.gastado).toBe(0);
  });

  it("el detalle lleva el hallazgo más grave, no el primero que apareció", () => {
    const informes: InformeDePantalla[] = [
      {
        persona: "pulgar",
        hallazgos: [
          { tipo: "texto-cortado", donde: "span.nombre", detalle: "queda cortado" },
          { tipo: "desborde", donde: "div.tarjeta", detalle: "se sale 40 px de la pantalla" },
        ],
      },
    ];
    expect(armarVeredicto(informes, 0).detalle).toContain("div.tarjeta");
  });

  it("entre dos igual de graves nombra siempre el mismo, venga en el orden que venga", () => {
    const a = { tipo: "target-chico", donde: "a «Ayuda»", detalle: "mide 30×17 px" };
    const b = { tipo: "target-chico", donde: "button.comprar «Comprar»", detalle: "mide 88×28 px" };
    // El mismo conjunto en los dos órdenes tiene que dar el mismo motivo: con la página bajo carga
    // los elementos no vuelven siempre en el mismo orden.
    const de = (hallazgos: InformeDePantalla["hallazgos"]) => armarVeredicto([{ persona: "pulgar", hallazgos }], 0).detalle;
    expect(de([a, b])).toBe(de([b, a]));
    expect(de([a, b])).toContain("a «Ayuda»");
  });

  it("doce veces el mismo problema se cuentan como uno y se dice cuántos", () => {
    const hallazgos = Array.from({ length: 9 }, (_, i) => ({
      tipo: "target-chico",
      donde: `button ${i}`,
      detalle: "mide 38 px",
    }));
    const v = armarVeredicto([{ persona: "pulgar", hallazgos }], 0);
    expect(v.detalle).toContain("y 8 más igual");
  });

  it("la tolerancia deja pasar lo que se decidió tolerar", () => {
    const informes: InformeDePantalla[] = [
      { persona: "pulgar", hallazgos: [{ tipo: "target-chico", donde: "x", detalle: "y" }] },
    ];
    expect(armarVeredicto(informes, 0).paso).toBe(false);
    expect(armarVeredicto(informes, 1).paso).toBe(true);
  });

  it("la evidencia guarda todo aunque el detalle resuma", () => {
    const v = armarVeredicto(
      [
        { persona: "pulgar", hallazgos: [{ tipo: "desborde", donde: "a", detalle: "uno" }] },
        { persona: "subte", hallazgos: [{ tipo: "red", donde: "b", detalle: "dos" }] },
      ],
      0,
    );
    expect(v.evidencia).toContain("pulgar");
    expect(v.evidencia).toContain("subte");
    expect(v.evidencia).toContain("dos");
  });
});

describe("qué pantallas se prueban", () => {
  it("sin contrato, una sola pasada por la url base", () => {
    expect(superficiesAProbar(undefined)).toEqual([undefined]);
  });

  it("con contrato, prueba las superficies declaradas", () => {
    expect(superficiesAProbar({ superficies: ["/facturas", "/panel"] })).toEqual(["/facturas", "/panel"]);
  });

  it("un cambio que toca veinte pantallas no hace eterno el escalón", () => {
    const muchas = Array.from({ length: 20 }, (_, i) => `/r${i}`);
    expect(superficiesAProbar({ superficies: muchas }, 3)).toHaveLength(3);
  });

  it("superficies vacías o en blanco caen a la url base", () => {
    expect(superficiesAProbar({ superficies: [] })).toEqual([undefined]);
    expect(superficiesAProbar({ superficies: ["  "] })).toEqual([undefined]);
  });
});

describe("el portón le pasa el contrato al verificador", () => {
  it("el verificador recibe lo que el agente declaró", async () => {
    const recibido: unknown[] = [];
    const espia = {
      nombre: "pantalla",
      costo: "gratis" as const,
      async correr(_u: unknown, contexto?: unknown) {
        recibido.push(contexto);
        return { paso: true, detalle: "ok", gastado: 0 };
      },
    };

    const universo = { id: "u1", rama: "x", ruta: "/x", nacido: 0 };
    const contextos = new Map([["u1", { contrato: { superficies: ["/facturas"] }, enfoque: "mínimo" }]]);

    await cruzarPorton([universo], [espia], undefined, contextos);

    expect(recibido[0]).toEqual({ contrato: { superficies: ["/facturas"] }, enfoque: "mínimo" });
  });
});
