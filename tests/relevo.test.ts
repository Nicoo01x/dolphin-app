import { describe, expect, it } from "vitest";
import { conRelevo, esNoDisponible, proveedorDeMotor, revisarCadena } from "../src/nucleo/relevo.js";
import { cuentaDelAgente } from "../src/nucleo/parte.js";
import { sembrar } from "../src/nucleo/sembrar.js";
import { TallerDeJuguete } from "../src/nucleo/taller.js";
import { FalloDelAgente } from "../src/nucleo/tipos.js";
import type { Agente, Trabajo, Universo } from "../src/nucleo/tipos.js";

/**
 * El relevo de motor a mitad de tarea. Lo que importa: que la rama no se pierda cuando el titular
 * se queda sin cupo, que el que entra reciba lo que ya se hizo, que NO se rote entre cuentas del
 * mismo proveedor, y que un motor que trabajó mal no se releve —eso multiplica el gasto.
 */

const UNIVERSO: Universo = { id: "u1", rama: "dolphin/exportar", ruta: "/no/existe", nacido: 0 };

const FORMA = { archivos: 2, agregadas: 30, quitadas: 4, dependenciasNuevas: 0, tocados: [], testsCambiados: [] };

/** Un motor que trabaja y anota qué pedido recibió. */
function motorQueTrabaja(nombre: string, trabajo: Partial<Trabajo> = {}): Agente & { pedidos: string[] } {
  const pedidos: string[] = [];
  return {
    nombre,
    pedidos,
    async trabajar(_universo, tarea) {
      pedidos.push(tarea);
      return { forma: FORMA, gastado: 0, modelo: nombre, ...trabajo };
    },
  };
}

/** Un motor que se cae siempre con el mismo motivo. */
function motorQueSeCae(nombre: string, porQue: string, gastado = 0, costoDesconocido = false): Agente {
  return {
    nombre,
    async trabajar() {
      throw new FalloDelAgente(porQue, gastado, costoDesconocido);
    },
  };
}

const sinArchivos = { tocados: async () => [] };

describe("qué cuenta como «no pudo trabajar»", () => {
  it("el cupo, la cuota y el 429 sí", () => {
    for (const motivo of [
      "claude: usage limit reached · resets 3pm",
      "el cupo de gemini está en 97 % de las 5 h",
      "429 Too Many Requests",
      "insufficient_quota",
      "Error 503: Service Unavailable",
      "overloaded_error",
    ]) {
      expect(esNoDisponible(motivo), motivo).toBe(true);
    }
  });

  it("la puerta cerrada también: sin clave, sin sesión, sin binario", () => {
    for (const motivo of [
      "you must specify the GEMINI_API_KEY",
      "401 Unauthorized",
      "invalid api key",
      "session expired, please log in again",
      "no encontré «droid» en el PATH: instalá Droid, de Factory",
      "spawn cursor-agent ENOENT",
    ]) {
      expect(esNoDisponible(motivo), motivo).toBe(true);
    }
  });

  it("trabajar mal NO es no estar disponible: eso lo arregla el bucle de corrección", () => {
    for (const motivo of [
      "no tocó ningún archivo: contestó en vez de trabajar",
      "test: ✖ exportar › separa los campos con punto y coma",
      "typecheck salió con 2: src/panel/exportar.ts(14,7): error TS2345",
      "la corrección se cayó (timeout)",
    ]) {
      expect(esNoDisponible(motivo), motivo).toBe(false);
    }
  });
});

describe("la cadena de relevo", () => {
  it("no deja dos motores del mismo proveedor: eso sería rotar cuentas", () => {
    expect(() => revisarCadena([{ agente: motorQueTrabaja("claude") }, { agente: motorQueTrabaja("claude opus-4") }])).toThrow(/mismo proveedor/);
    // Gemini y Antigravity son los dos de Google, aunque se llamen distinto.
    expect(() => revisarCadena([{ agente: motorQueTrabaja("gemini") }, { agente: motorQueTrabaja("antigravity") }])).toThrow(/google/);
  });

  it("de distinto proveedor sí, y un motor de proveedor desconocido no bloquea a nadie", () => {
    expect(() => revisarCadena([{ agente: motorQueTrabaja("claude") }, { agente: motorQueTrabaja("gemini") }])).not.toThrow();
    expect(() => revisarCadena([{ agente: motorQueTrabaja("opencode") }, { agente: motorQueTrabaja("mi-acp") }])).not.toThrow();
    expect(proveedorDeMotor("opencode")).toBeUndefined();
    expect(proveedorDeMotor("claude sonnet-4.5")).toBe("anthropic");
  });

  it("una cadena vacía no es una cadena", () => {
    expect(() => revisarCadena([])).toThrow(/al menos un motor/);
  });
});

describe("el relevo a mitad de tarea", () => {
  it("sin problemas, trabaja el titular y nadie se entera de la cadena", async () => {
    const claude = motorQueTrabaja("claude");
    const gemini = motorQueTrabaja("gemini");
    const trabajo = await conRelevo([{ agente: claude }, { agente: gemini }], sinArchivos).trabajar(UNIVERSO, "Exportar a CSV");

    expect(claude.pedidos).toEqual(["Exportar a CSV"]);
    expect(gemini.pedidos).toEqual([]);
    expect(trabajo.relevo).toBeUndefined();
  });

  it("si el titular se queda sin cupo, sigue el otro con el traspaso de lo que ya se hizo", async () => {
    const gemini = motorQueTrabaja("gemini");
    const agente = conRelevo([{ agente: motorQueSeCae("claude", "usage limit reached · resets 3pm", 0.12) }, { agente: gemini }], {
      tocados: async () => ["src/panel/exportar.ts"],
    });

    const trabajo = await agente.trabajar(UNIVERSO, "Exportar los pedidos a CSV");

    const pedido = gemini.pedidos[0]!;
    expect(pedido).toContain("Esto es un traspaso");
    expect(pedido).toContain("claude");
    expect(pedido).toContain("usage limit");
    expect(pedido).toContain("Exportar los pedidos a CSV");
    // El worktree es el mismo: lo que el titular dejó escrito se le nombra.
    expect(pedido).toContain("src/panel/exportar.ts");
    expect(trabajo.relevo).toEqual({ salio: ["claude"], entro: "gemini" });
  });

  it("lo que gastó el que se cayó se paga igual, y «no sé cuánto» se arrastra", async () => {
    const agente = conRelevo(
      [
        { agente: motorQueSeCae("claude", "usage limit reached", 0.4) },
        { agente: motorQueSeCae("codex", "429 Too Many Requests", 0, true) },
        { agente: motorQueTrabaja("gemini", { gastado: 0.1 }) },
      ],
      sinArchivos,
    );

    const trabajo = await agente.trabajar(UNIVERSO, "Exportar a CSV");
    expect(trabajo.gastado).toBeCloseTo(0.5);
    expect(trabajo.costoDesconocido).toBe(true);
    expect(trabajo.relevo).toEqual({ salio: ["claude", "codex"], entro: "gemini" });
  });

  it("un motor que trabajó mal NO se releva: pagarle a los dos por el mismo error multiplica el gasto", async () => {
    const gemini = motorQueTrabaja("gemini");
    const agente = conRelevo([{ agente: motorQueSeCae("claude", "no tocó ningún archivo: contestó en vez de trabajar", 0.3) }, { agente: gemini }], sinArchivos);

    await expect(agente.trabajar(UNIVERSO, "Exportar a CSV")).rejects.toThrow(/no tocó ningún archivo/);
    expect(gemini.pedidos).toEqual([]);
  });

  it("si ninguno pudo, el corte nombra a todos con su motivo y no pierde la plata", async () => {
    const agente = conRelevo(
      [{ agente: motorQueSeCae("claude", "usage limit reached", 0.2) }, { agente: motorQueSeCae("gemini", "you must specify the GEMINI_API_KEY") }],
      sinArchivos,
    );

    const fallo = await agente.trabajar(UNIVERSO, "Exportar a CSV").catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(FalloDelAgente);
    expect((fallo as Error).message).toContain("usage limit");
    expect((fallo as Error).message).toContain("GEMINI_API_KEY");
    expect((fallo as FalloDelAgente).gastado).toBeCloseTo(0.2);
  });

  it("al que ya sabemos agotado no se le paga el intento", async () => {
    const claude = motorQueTrabaja("claude");
    const gemini = motorQueTrabaja("gemini");
    const agente = conRelevo([{ agente: claude }, { agente: gemini }], {
      ...sinArchivos,
      disponible: (motor) => motor !== "claude",
    });

    await agente.trabajar(UNIVERSO, "Exportar a CSV");
    expect(claude.pedidos).toEqual([]);
    expect(gemini.pedidos[0]).toContain("Esto es un traspaso");
    expect(gemini.pedidos[0]).toContain("no estaba disponible para arrancar");
  });

  it("corregir también se releva, y el que entra sin corregir recibe la falla en el traspaso", async () => {
    const gemini = motorQueTrabaja("gemini");
    const agente = conRelevo([{ agente: motorQueSeCae("claude", "session expired") }, { agente: gemini }], sinArchivos);

    await agente.corregir!(UNIVERSO, "Exportar a CSV", { verificador: "test", detalle: "✖ separa con punto y coma" });

    expect(gemini.pedidos[0]).toContain("POR QUÉ REBOTÓ (fase «test»)");
    expect(gemini.pedidos[0]).toContain("separa con punto y coma");
  });

  it("avisa cuando la rama cambia de manos: la consola y el parte tienen que decirlo", async () => {
    const avisos: { salio: string; entra: string }[] = [];
    const agente = conRelevo([{ agente: motorQueSeCae("claude", "usage limit reached") }, { agente: motorQueTrabaja("gemini") }], {
      ...sinArchivos,
      alRelevar: ({ salio, entra }) => avisos.push({ salio, entra }),
    });

    await agente.trabajar(UNIVERSO, "Exportar a CSV");
    expect(avisos).toEqual([{ salio: "claude", entra: "gemini" }]);
  });

  it("la cosecha dice que la rama cambió de manos, y el parte también", async () => {
    const cosecha = await sembrar({
      tarea: "Exportar los pedidos a CSV",
      cantidad: 1,
      rama: "fix",
      taller: new TallerDeJuguete(),
      agente: conRelevo([{ agente: motorQueSeCae("claude", "usage limit reached", 0.2) }, { agente: motorQueTrabaja("gemini") }], sinArchivos),
      verificadores: [
        {
          nombre: "tipos",
          costo: "gratis" as const,
          async correr() {
            return { paso: true, detalle: "pasó", gastado: 0 };
          },
        },
      ],
    });

    expect(cosecha.ganador?.relevo).toEqual({ salio: ["claude"], entro: "gemini" });
    // Lo que gastó el que se cayó está adentro del número de la rama: por eso hay que decirlo.
    expect(cosecha.ganador?.gastadoAgente).toBeCloseTo(0.2);
    expect(cuentaDelAgente(cosecha.ganador!, true)).toContain("la siguió gemini porque claude no pudo trabajar");
  });

  it("el traspaso no se lleva credenciales a la otra empresa", async () => {
    const gemini = motorQueTrabaja("gemini");
    const agente = conRelevo([{ agente: motorQueSeCae("claude", "429: con GITHUB_TOKEN=ghp_1234567890abcdef no anda") }, { agente: gemini }], sinArchivos);

    await agente.trabajar(UNIVERSO, "Exportar a CSV");
    expect(gemini.pedidos[0]).not.toContain("ghp_1234567890abcdef");
    expect(gemini.pedidos[0]).toContain("OMITIDO");
  });
});
