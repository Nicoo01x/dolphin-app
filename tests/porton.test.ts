import { describe, expect, it } from "vitest";
import { esperarA } from "./ayuda/esperar.js";
import { cruzarPorton, decirSalteadas, fasesSalteadas, gastoPorCosto, ordenarPorCosto, sinFase } from "../src/nucleo/porton.js";
import { elegir } from "../src/nucleo/elegir.js";
import { FalloDelAgente, type Universo, type Verificador } from "../src/nucleo/tipos.js";

function universo(id: string): Universo {
  return { id, rama: `x/${id}`, ruta: `/juguete/${id}`, nacido: 0 };
}

function verificador(
  nombre: string,
  costo: Verificador["costo"],
  decide: (u: Universo) => boolean,
  gastado = 0,
  registro?: string[],
): Verificador {
  return {
    nombre,
    costo,
    async correr(u) {
      registro?.push(`${nombre}:${u.id}`);
      const paso = decide(u);
      return { paso, detalle: paso ? `${nombre} pasó` : `${nombre} falló`, gastado };
    },
  };
}

describe("el portón", () => {
  it("ordena los verificadores de lo gratis a lo caro, sin importar cómo se los pasen", () => {
    const orden = ordenarPorCosto([
      verificador("opus", "caro", () => true),
      verificador("tipos", "gratis", () => true),
      verificador("haiku", "barato", () => true),
    ]).map((v) => v.nombre);

    expect(orden).toEqual(["tipos", "haiku", "opus"]);
  });

  it("no gasta un solo token si todos mueren en el escalón gratis", async () => {
    const registro: string[] = [];
    const resultado = await cruzarPorton(
      [universo("u1"), universo("u2"), universo("u3")],
      [
        verificador("tipos", "gratis", () => false, 0, registro),
        verificador("opus", "caro", () => true, 1.53, registro),
      ],
    );

    expect(resultado.gastado).toBe(0);
    expect(resultado.muertosGratis).toBe(3);
    expect(registro.some((r) => r.startsWith("opus"))).toBe(false);
  });

  it("al escalón caro solo llegan los que siguen vivos", async () => {
    const registro: string[] = [];
    await cruzarPorton(
      [universo("u1"), universo("u2"), universo("u3"), universo("u4")],
      [
        verificador("tipos", "gratis", (u) => u.id === "u1" || u.id === "u2", 0, registro),
        verificador("pantalla", "gratis", (u) => u.id === "u1", 0, registro),
        verificador("opus", "caro", () => true, 1.53, registro),
      ],
    );

    expect(registro.filter((r) => r.startsWith("tipos"))).toHaveLength(4);
    expect(registro.filter((r) => r.startsWith("pantalla"))).toHaveLength(2);
    expect(registro.filter((r) => r.startsWith("opus"))).toEqual(["opus:u1"]);
  });

  it("guarda quién lo mató y por qué, en voz humana", async () => {
    const resultado = await cruzarPorton(
      [universo("u1")],
      [
        {
          nombre: "pantalla",
          costo: "gratis",
          async correr() {
            return { paso: false, detalle: "desborde en 390 px", gastado: 0 };
          },
        },
      ],
    );

    const u1 = resultado.candidatos[0]!;
    expect(u1.vivo).toBe(false);
    expect(u1.murioEn).toBe("pantalla");
    expect(u1.porQue).toBe("desborde en 390 px");
  });

  it("un candidato que ya gastó no cuenta como muerto gratis", async () => {
    const resultado = await cruzarPorton(
      [universo("u1")],
      [
        verificador("tipos", "gratis", () => true),
        verificador("haiku", "barato", () => false, 0.31),
      ],
    );

    expect(resultado.muertosGratis).toBe(0);
    expect(resultado.gastado).toBe(0.31);
    expect(gastoPorCosto(resultado.candidatos)).toEqual({ gratis: 0, barato: 0.31, caro: 0 });
  });

  it("corre el escalón en paralelo: no espera a que uno termine para empezar el otro", async () => {
    let enVuelo = 0;
    let pico = 0;

    const lento: Verificador = {
      nombre: "lento",
      costo: "gratis",
      async correr() {
        enVuelo += 1;
        pico = Math.max(pico, enVuelo);
        // Cada uno se queda hasta que los tres arrancaron: si el portón los corriera de a uno,
        // ninguno vería a los otros dos y el pico quedaría en 1. Un plazo fijo acá medía la
        // velocidad de la máquina, no el paralelismo.
        await esperarA(() => enVuelo === 3);
        enVuelo -= 1;
        return { paso: true, detalle: "ok", gastado: 0 };
      },
    };

    await cruzarPorton([universo("u1"), universo("u2"), universo("u3")], [lento]);
    expect(pico).toBe(3);
  });

  it("una fase que no corrió deja pasar, pero queda salteada y no se cuenta como pasada", async () => {
    const roto: Verificador = {
      nombre: "pantalla",
      costo: "gratis",
      async correr() {
        throw new Error("no hay Chrome");
      },
    };
    const sinFormato: Verificador = {
      nombre: "revisión",
      costo: "barato",
      async correr() {
        return { paso: true, salteada: true, detalle: "revisión: el revisor no contestó en el formato pedido ni a la segunda, se salteó", gastado: 0.004 };
      },
    };
    const resultado = await cruzarPorton([universo("u1")], [verificador("tipos", "gratis", () => true), roto, sinFormato]);
    const u1 = resultado.candidatos[0]!;

    // El código no tiene la culpa: sigue vivo.
    expect(u1.vivo).toBe(true);
    expect(u1.pasadas.map((p) => [p.verificador, p.salteada ?? false])).toEqual([
      ["tipos", false],
      ["pantalla", true],
      ["revisión", true],
    ]);
    expect(u1.pasadas[1]!.detalle).toBe("pantalla: se rompió el verificador, se salteó (no hay Chrome)");
    expect(fasesSalteadas(u1)).toEqual(["pantalla", "revisión"]);
    expect(decirSalteadas(["revisión"])).toBe("se salteó revisión");
    expect(decirSalteadas(["pantalla", "vision", "revisión"])).toBe("se saltearon pantalla, vision y revisión");

    // Y la elegida no dice «pasó todas las fases».
    const { porQue } = elegir(resultado.candidatos);
    expect(porQue).toBe("Pasó las fases que corrieron; se saltearon pantalla y revisión. Miralo vos antes de mergear.");
    expect(elegir([{ ...u1, pasadas: u1.pasadas.slice(0, 1) }]).porQue).toBe("Pasó todas las fases.");
  });
});

describe("el bucle Code → Test → Fix → Prove", () => {
  /** Un verificador que falla hasta que alguien «arregla» el universo. */
  const arreglables = () => {
    const arreglados = new Set<string>();
    const fase = (nombre: string, costo: Verificador["costo"] = "gratis"): Verificador => ({
      nombre,
      costo,
      async correr(u) {
        const paso = arreglados.has(u.id);
        return { paso, detalle: paso ? `${nombre} pasó` : `${nombre}: ✖ sigue roto`, gastado: 0 };
      },
    });
    return { arreglados, fase };
  };

  it("un intento rebotado recibe el veredicto, corrige y la MISMA fase se vuelve a correr", async () => {
    const { arreglados, fase } = arreglables();
    const fallas: string[] = [];

    const resultado = await cruzarPorton(
      [universo("u1")],
      [fase("test")],
      undefined,
      new Map(),
      undefined,
      {
        reintentos: 1,
        corregir: async (u, falla) => {
          fallas.push(`${u.id} ← ${falla.verificador}: ${falla.detalle}`);
          arreglados.add(u.id);
          return { gastado: 0.01 };
        },
      },
    );

    const c = resultado.candidatos[0]!;
    expect(c.vivo).toBe(true);
    // Las dos vueltas quedan anotadas: la que rebotó y la que pasó.
    expect(c.pasadas.map((x) => [x.paso, x.intento ?? 1])).toEqual([
      [false, 1],
      [true, 2],
    ]);
    // El agente recibió el veredicto de verdad, no un «falló» pelado.
    expect(fallas).toEqual(["u1 ← test: test: ✖ sigue roto"]);
    // Lo que gastó la corrección se paga: la cosecha no informa de menos.
    expect(resultado.gastado).toBeCloseTo(0.01);
  });

  it("si la corrección no alcanza, el corte queda con el diagnóstico y sin fingir", async () => {
    const { fase } = arreglables(); // nadie arregla nada
    let correcciones = 0;

    const resultado = await cruzarPorton(
      [universo("u1")],
      [fase("test")],
      undefined,
      new Map(),
      undefined,
      {
        reintentos: 2,
        corregir: async () => {
          correcciones += 1;
          return { gastado: 0 };
        },
      },
    );

    const c = resultado.candidatos[0]!;
    expect(correcciones).toBe(2); // los límites son límites
    expect(c.vivo).toBe(false);
    expect(c.murioEn).toBe("test");
    expect(c.pasadas).toHaveLength(3); // 1 + 2 reintentos, todos a la vista
  });

  it("el presupuesto corta el bucle: sin plata no se corrige más", async () => {
    const { fase } = arreglables();
    let correcciones = 0;

    const caro: Verificador = {
      nombre: "test",
      costo: "caro",
      async correr(u) {
        void u;
        return { paso: false, detalle: "test: ✖ roto", gastado: 0.5 };
      },
    };
    void fase;

    await cruzarPorton([universo("u1")], [caro], undefined, new Map(), undefined, {
      reintentos: 5,
      presupuesto: 0.4, // ya gastado 0.5 en la primera pasada: no hay margen
      corregir: async () => {
        correcciones += 1;
        return { gastado: 0 };
      },
    });

    expect(correcciones).toBe(0);
  });

  it("si corregir explota, el intento queda cortado con esa explicación", async () => {
    const { fase } = arreglables();

    const resultado = await cruzarPorton(
      [universo("u1")],
      [fase("test")],
      undefined,
      new Map(),
      undefined,
      {
        reintentos: 3,
        corregir: async () => {
          throw new Error("se quedó sin contexto");
        },
      },
    );

    const c = resultado.candidatos[0]!;
    expect(c.vivo).toBe(false);
    expect(c.porQue).toContain("la corrección se cayó");
    expect(c.porQue).toContain("se quedó sin contexto");
  });

  it("una corrección que se cae después de gastar se cuenta, y ese corte no es gratis", async () => {
    const { fase } = arreglables();
    const resultado = await cruzarPorton([universo("u1")], [fase("test")], undefined, new Map(), undefined, {
      reintentos: 1,
      corregir: async () => {
        throw new FalloDelAgente("se le terminaron las vueltas", 0.04);
      },
    });

    expect(resultado.candidatos[0]!.porQue).toContain("la corrección se cayó");
    expect(resultado.gastado).toBe(0.04);
    expect(resultado.muertosGratis).toBe(0);
  });

  it("una rama que gastó corrigiendo y se cortó igual no murió gratis", async () => {
    const { fase } = arreglables(); // nadie arregla nada
    const resultado = await cruzarPorton([universo("u1"), universo("u2")], [fase("test")], undefined, new Map(), undefined, {
      reintentos: 1,
      corregir: async (u) => ({ gastado: u.id === "u1" ? 0.05 : 0 }),
    });

    expect(resultado.candidatos.every((c) => !c.vivo)).toBe(true);
    expect(resultado.gastado).toBe(0.05);
    // u2 corrigió sin gastar (un motor de mentira): esa sí es una muerte gratis.
    expect(resultado.muertosGratis).toBe(1);
  });

  it("al mostrar un veredicto se corta el nombre exacto de la fase, no hasta los primeros dos puntos", () => {
    expect(sinFase("test:oculto: ✖ falta el tope del 50 %", "test:oculto")).toBe("✖ falta el tope del 50 %");
    expect(sinFase("pantalla · pulgar: button mide 86×28 px", "pantalla")).toBe("pulgar: button mide 86×28 px");
    // Un motivo que no empieza con la fase queda entero, aunque tenga dos puntos adentro.
    expect(sinFase("la corrección de «test:oculto» lo rompió", "test")).toBe("la corrección de «test:oculto» lo rompió");
  });

  it("sin corrector, el portón corta a la primera como siempre", async () => {
    const { fase } = arreglables();
    const resultado = await cruzarPorton([universo("u1")], [fase("test")]);
    expect(resultado.candidatos[0]!.vivo).toBe(false);
    expect(resultado.candidatos[0]!.pasadas).toHaveLength(1);
  });

  it("si la corrección de una fase rompe una anterior, el corte es en la anterior y lo dice", async () => {
    // Los tests pasan hasta que el agente «corrige» lo que marcó la revisión:
    // al arreglar eso, rompe un test. Antes, nadie volvía a mirar los tests.
    let corregido = false;
    const test: Verificador = {
      nombre: "test",
      costo: "gratis",
      async correr() {
        return corregido ? { paso: false, detalle: "test: ✖ suma el IVA", gastado: 0 } : { paso: true, detalle: "test: pasó", gastado: 0 };
      },
    };
    const revision: Verificador = {
      nombre: "revisión",
      costo: "barato",
      async correr() {
        return corregido
          ? { paso: true, detalle: "revisión: cumple la tarea", gastado: 0.001 }
          : { paso: false, detalle: "revisión: no redondea a centavos", gastado: 0.001 };
      },
    };

    const resultado = await cruzarPorton([universo("u1")], [revision, test], undefined, new Map(), undefined, {
      reintentos: 1,
      corregir: async () => {
        corregido = true;
        return { gastado: 0.02 };
      },
    });

    const c = resultado.candidatos[0]!;
    expect(c.vivo).toBe(false);
    expect(c.murioEn).toBe("test");
    expect(c.porQue).toBe("test: ✖ suma el IVA (lo rompió la corrección de «revisión»)");
    // Se ve todo el camino: test en verde, revisión en rojo, revisión en verde tras corregir, test en rojo.
    expect(c.pasadas.map((p) => `${p.verificador}:${p.paso}`)).toEqual(["test:true", "revisión:false", "revisión:true", "test:false"]);
  });

  it("si la corrección no rompió nada, las fases anteriores se repasan sin dejar filas de más", async () => {
    const { arreglados, fase } = arreglables();
    const registro: string[] = [];
    const tipos = verificador("tipos", "gratis", () => true, 0, registro);

    const resultado = await cruzarPorton([universo("u1")], [tipos, fase("revisión", "barato")], undefined, new Map(), undefined, {
      reintentos: 1,
      corregir: async (u) => {
        arreglados.add(u.id);
        return { gastado: 0 };
      },
    });

    const c = resultado.candidatos[0]!;
    expect(c.vivo).toBe(true);
    expect(registro).toEqual(["tipos:u1", "tipos:u1"]); // se volvió a correr
    expect(c.pasadas.map((p) => p.verificador)).toEqual(["tipos", "revisión", "revisión"]);
  });
});
