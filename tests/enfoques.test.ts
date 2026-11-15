import { describe, expect, it } from "vitest";
import { angulosDistintos, ENFOQUES, repartirEnfoques } from "../src/nucleo/enfoques.js";
import { leerContrato, armarPrompt } from "../src/agentes/claude.js";
import { sembrar } from "../src/nucleo/sembrar.js";
import { TallerDeJuguete } from "../src/nucleo/taller.js";
import type { Agente, Verificador } from "../src/nucleo/tipos.js";

describe("repartir enfoques", () => {
  it("le da un ángulo distinto a cada universo", () => {
    const repartidos = repartirEnfoques(5);
    expect(repartidos).toHaveLength(5);
    expect(angulosDistintos(repartidos)).toBe(5);
  });

  it("con más universos que ángulos, los repite en orden", () => {
    const repartidos = repartirEnfoques(ENFOQUES.length + 2);
    expect(repartidos).toHaveLength(ENFOQUES.length + 2);
    expect(angulosDistintos(repartidos)).toBe(ENFOQUES.length);
    expect(repartidos[ENFOQUES.length]!.nombre).toBe(ENFOQUES[0]!.nombre);
  });

  it("los primeros ángulos son los más útiles: una siembra de 3 los prueba", () => {
    const tres = repartirEnfoques(3).map((e) => e.nombre);
    expect(tres).toEqual(["mínimo", "raíz", "test primero"]);
  });

  it("sembrar cero o con una lista vacía no explota", () => {
    expect(repartirEnfoques(0)).toEqual([]);
    expect(repartirEnfoques(3, [])).toEqual([]);
  });
});

describe("el prompt lleva el ángulo", () => {
  it("mete la instrucción del enfoque", () => {
    const prompt = armarPrompt("arreglalo", undefined, "hacé el cambio más chico posible");
    expect(prompt).toContain("hacé el cambio más chico posible");
  });

  it("siempre pide el contrato de superficie", () => {
    expect(armarPrompt("x")).toContain("SUPERFICIES:");
  });
});

describe("leer el contrato de superficie", () => {
  it("saca las rutas y el resumen", () => {
    const contrato = leerContrato(
      "Listo.\nSUPERFICIES: /facturas, /app/panel\nRESUMEN: el botón Emitir ahora valida el CUIT",
    );
    expect(contrato?.superficies).toEqual(["/facturas", "/app/panel"]);
    expect(contrato?.resumen).toContain("valida el CUIT");
  });

  it("«ninguna» significa que el cambio no se ve en pantalla", () => {
    const contrato = leerContrato("SUPERFICIES: ninguna\nRESUMEN: refactor interno");
    expect(contrato?.superficies).toEqual([]);
    expect(contrato?.resumen).toBe("refactor interno");
  });

  it("si el agente no contestó el formato, no inventa un contrato", () => {
    expect(leerContrato("Ya está, arreglé la función.")).toBeUndefined();
  });

  it("si lo repite, vale la última vez que lo dijo", () => {
    const contrato = leerContrato("SUPERFICIES: /viejo\ntexto\nSUPERFICIES: /nuevo");
    expect(contrato?.superficies).toEqual(["/nuevo"]);
  });

  it("la nota del agente para quien venga después va con el contrato; «ninguna» no es una nota", () => {
    expect(armarPrompt("x")).toContain("NOTA:");
    const con = leerContrato("SUPERFICIES: ninguna\nRESUMEN: arregla el IVA\nNOTA: los tests de plata se corren con npm run test:plata");
    expect(con?.nota).toBe("los tests de plata se corren con npm run test:plata");
    expect(leerContrato("SUPERFICIES: ninguna\nRESUMEN: x\n**NOTA:** ninguna.")?.nota).toBeUndefined();
  });
});

describe("la siembra reparte los ángulos", () => {
  const siempreBien: Verificador = {
    nombre: "tipos",
    costo: "gratis",
    async correr() {
      return { paso: true, detalle: "pasó", gastado: 0 };
    },
  };

  it("cada universo recibe un enfoque distinto y queda registrado", async () => {
    const recibidos: string[] = [];

    const agente: Agente = {
      nombre: "espía",
      async trabajar(_u, _t, enfoque) {
        recibidos.push(enfoque?.nombre ?? "—");
        return {
          forma: { archivos: 1, agregadas: 5, quitadas: 0, dependenciasNuevas: 0 },
          gastado: 0,
          contrato: { superficies: ["/x"] },
        };
      },
    };

    const cosecha = await sembrar({
      tarea: "x",
      cantidad: 4,
      rama: "fix",
      taller: new TallerDeJuguete(),
      agente,
      verificadores: [siempreBien],
    });

    expect(new Set(recibidos).size).toBe(4);
    expect(cosecha.candidatos.every((c) => c.enfoque !== undefined)).toBe(true);
    expect(cosecha.candidatos.every((c) => c.contrato?.superficies[0] === "/x")).toBe(true);
  });
});

describe("el contrato llega aunque el modelo lo adorne", () => {
  it("lo lee con negritas de markdown", () => {
    const c = leerContrato("Listo.\n**SUPERFICIES:** /facturas, /app\n**RESUMEN:** valida el CUIT");
    expect(c?.superficies).toEqual(["/facturas", "/app"]);
    expect(c?.resumen).toBe("valida el CUIT");
  });

  it("lo lee como viñeta", () => {
    expect(leerContrato("- SUPERFICIES: /panel")?.superficies).toEqual(["/panel"]);
  });

  it("lo lee dentro de una cita", () => {
    expect(leerContrato("> SUPERFICIES: /x")?.superficies).toEqual(["/x"]);
  });

  it("no se confunde con una oración que menciona la palabra", () => {
    expect(leerContrato("Las superficies afectadas son varias.")).toBeUndefined();
  });
});
