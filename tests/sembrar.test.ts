import { describe, expect, it } from "vitest";
import { sembrar } from "../src/nucleo/sembrar.js";
import { elegir } from "../src/nucleo/elegir.js";
import { TallerDeJuguete } from "../src/nucleo/taller.js";
import type { Agente, Candidato, Forma, Verificador } from "../src/nucleo/tipos.js";

function forma(p: Partial<Forma>): Forma {
  return { archivos: 1, agregadas: 10, quitadas: 0, dependenciasNuevas: 0, ...p };
}

function candidato(id: string, vivo: boolean, f?: Partial<Forma>): Candidato {
  return {
    universo: { id, rama: `x/${id}`, ruta: `/juguete/${id}`, nacido: 0 },
    vivo,
    pasadas: [],
    ...(f ? { forma: forma(f) } : {}),
  };
}

const siempreBien: Verificador = {
  nombre: "tipos",
  costo: "gratis",
  async correr() {
    return { paso: true, detalle: "pasó", gastado: 0 };
  },
};

function agenteQue(hace: (id: string) => Forma | Error): Agente {
  return {
    nombre: "juguete",
    async trabajar(universo) {
      const salida = hace(universo.id);
      if (salida instanceof Error) throw salida;
      return { forma: salida, gastado: 0 };
    },
  };
}

describe("elegir el más simple", () => {
  it("una rama sin fases no «pasó todas las fases»: se dice que nadie la probó", () => {
    const sola = elegir([candidato("u1", true, {})]);
    expect(sola.porQue).toContain("se entregó sin probar");
    expect(sola.porQue).not.toContain("Pasó todas las fases");

    const probada = elegir([{ ...candidato("u1", true, {}), pasadas: [{ verificador: "test", costo: "gratis", paso: true, detalle: "test: pasó", gastado: 0, ms: 10 }] }]);
    expect(probada.porQue).toBe("Pasó todas las fases.");
  });

  it("una dependencia nueva pesa más que cien líneas", () => {
    const { ganador } = elegir([
      candidato("u1", true, { dependenciasNuevas: 1, agregadas: 4 }),
      candidato("u2", true, { dependenciasNuevas: 0, agregadas: 140 }),
    ]);
    expect(ganador?.universo.id).toBe("u2");
  });

  it("a igual dependencia, gana el que toca menos archivos", () => {
    const { ganador } = elegir([
      candidato("u1", true, { archivos: 6, agregadas: 10 }),
      candidato("u2", true, { archivos: 2, agregadas: 90 }),
    ]);
    expect(ganador?.universo.id).toBe("u2");
  });

  it("los muertos no se eligen aunque sean los más simples", () => {
    const { ganador } = elegir([
      candidato("u1", false, { archivos: 1, agregadas: 1 }),
      candidato("u2", true, { archivos: 9, agregadas: 300 }),
    ]);
    expect(ganador?.universo.id).toBe("u2");
  });

  it("si no pasó nadie, lo dice y cuenta quién los frenó", () => {
    const eleccion = elegir([
      { ...candidato("u1", false), murioEn: "tipos" },
      { ...candidato("u2", false), murioEn: "tipos" },
      { ...candidato("u3", false), murioEn: "pantalla" },
    ]);
    expect(eleccion.ganador).toBeUndefined();
    expect(eleccion.porQue).toContain("Ninguna de las 3 ramas");
    expect(eleccion.porQue).toContain("tipos (2)");
  });

  it("empatados, elige siempre el mismo: tiene que ser reproducible", () => {
    const a = candidato("u7", true, {});
    const b = candidato("u2", true, {});
    expect(elegir([a, b]).ganador?.universo.id).toBe("u2");
    expect(elegir([b, a]).ganador?.universo.id).toBe("u2");
  });
});

describe("sembrar", () => {
  it("abre un universo por intento y devuelve un ganador", async () => {
    const taller = new TallerDeJuguete();

    const cosecha = await sembrar({
      tarea: "arreglar el desborde",
      cantidad: 4,
      rama: "fix",
      taller,
      agente: agenteQue((id) => forma({ archivos: id === "u3" ? 1 : 5 })),
      verificadores: [siempreBien],
    });

    expect(cosecha.candidatos).toHaveLength(4);
    expect(cosecha.ganador?.universo.id).toBe("u3");
    expect(cosecha.porQueGano).toContain("Pasaron 4");
  });

  it("el universo que se cae escribiendo queda muerto y gratis, no rompe la siembra", async () => {
    const taller = new TallerDeJuguete();

    const cosecha = await sembrar({
      tarea: "lo que sea",
      cantidad: 3,
      rama: "fix",
      taller,
      agente: agenteQue((id) => (id === "u2" ? new Error("se quedó sin contexto") : forma({}))),
      verificadores: [siempreBien],
    });

    const u2 = cosecha.candidatos.find((c) => c.universo.id === "u2");
    expect(u2?.vivo).toBe(false);
    expect(u2?.murioEn).toBe("el agente");
    expect(u2?.porQue).toContain("sin contexto");
    expect(cosecha.muertosGratis).toBe(1);
    expect(cosecha.ganador).toBeDefined();
  });

  it("limpia todos los universos menos el del ganador", async () => {
    const taller = new TallerDeJuguete();

    const cosecha = await sembrar({
      tarea: "x",
      cantidad: 3,
      rama: "fix",
      taller,
      agente: agenteQue(() => forma({})),
      verificadores: [siempreBien],
    });

    expect(taller.cerrados).toHaveLength(2);
    expect(taller.cerrados).not.toContain(cosecha.ganador!.universo.id);
  });

  it("avisa cada paso para que la pantalla pueda seguirlo en vivo", async () => {
    const eventos: string[] = [];

    await sembrar({
      tarea: "x",
      cantidad: 2,
      rama: "fix",
      taller: new TallerDeJuguete(),
      agente: agenteQue(() => forma({})),
      verificadores: [siempreBien],
      alPasar: (e) => eventos.push(e.tipo),
    });

    expect(eventos.filter((e) => e === "nace")).toHaveLength(2);
    expect(eventos.filter((e) => e === "escribio")).toHaveLength(2);
    expect(eventos.at(-1)).toBe("cosecha");
  });
});

describe("la cuenta del turno", () => {
  it("suma lo que gastaron los agentes escribiendo, no solo los verificadores", async () => {
    const agenteCaro: Agente = {
      nombre: "caro",
      async trabajar() {
        return { forma: forma({}), gastado: 0.006 };
      },
    };

    const verificadorQueCobra: Verificador = {
      nombre: "juez",
      costo: "caro",
      async correr() {
        return { paso: true, detalle: "ok", gastado: 0.5 };
      },
    };

    const cosecha = await sembrar({
      tarea: "x",
      cantidad: 3,
      rama: "fix",
      taller: new TallerDeJuguete(),
      agente: agenteCaro,
      verificadores: [verificadorQueCobra],
    });

    // 3 agentes × 0,006 + 3 veredictos × 0,5
    expect(cosecha.gastado).toBeCloseTo(1.518, 4);
  });

  it("cada siembra usa su propio espacio de ramas, así dos turnos no se pisan", async () => {
    const taller = new TallerDeJuguete();
    const ramas: string[] = [];

    const espia = {
      abrir: async (id: string, rama: string) => {
        ramas.push(rama);
        return taller.abrir(id, rama);
      },
      cerrar: (u: Parameters<typeof taller.cerrar>[0]) => taller.cerrar(u),
    };

    await sembrar({
      tarea: "x", cantidad: 2, rama: "dolphin", taller: espia,
      agente: agenteQue(() => forma({})), verificadores: [siempreBien],
    });
    await sembrar({
      tarea: "x", cantidad: 2, rama: "dolphin", taller: espia,
      agente: agenteQue(() => forma({})), verificadores: [siempreBien],
    });

    const unicas = new Set(ramas);
    expect(unicas.size).toBeGreaterThan(1);
    expect([...unicas].every((r) => r.startsWith("dolphin/"))).toBe(true);
  });
});
