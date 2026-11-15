import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { medirForma } from "../src/nucleo/forma.js";
import { cruzarPorton } from "../src/nucleo/porton.js";
import { sembrar } from "../src/nucleo/sembrar.js";
import { elegir } from "../src/nucleo/elegir.js";
import { TallerDeJuguete } from "../src/nucleo/taller.js";
import { guardarCosecha, leerUltimaCosecha } from "../src/nucleo/archivo.js";
import { medirLineaBase } from "../src/nucleo/linea-base.js";
import { FalloDelAgente, type Agente, type Candidato, type Verificador } from "../src/nucleo/tipos.js";

/**
 * Los hallazgos de la revisión con ojos frescos, cada uno con su test.
 * Sin esto vuelven: son todos bugs que no se notan mirando el código.
 */

const correr = promisify(execFile);

const pasa: Verificador = {
  nombre: "tipos",
  costo: "gratis",
  async correr() {
    return { paso: true, detalle: "pasó", gastado: 0 };
  },
};

const agenteOk: Agente = {
  nombre: "ok",
  async trabajar() {
    return { forma: { archivos: 1, agregadas: 1, quitadas: 0, dependenciasNuevas: 0 }, gastado: 0 };
  },
};

describe("medir la forma ve los archivos NUEVOS", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-forma-"));
    await writeFile(join(repo, "viejo.txt"), "uno\n");
    await correr("git", ["init", "-q"], { cwd: repo });
    await correr("git", ["add", "-A"], { cwd: repo });
    await correr("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: repo });
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("un agente que SOLO crea archivos no se mide como que no hizo nada", async () => {
    // Es exactamente el enfoque «test primero»: escribe un test y nada más.
    await writeFile(join(repo, "nuevo.test.js"), "export const x = 1;\n");

    const forma = await medirForma(repo);
    expect(forma.archivos).toBe(1);
    expect(forma.agregadas).toBeGreaterThan(0);
  });

  it("cuenta los nuevos junto con los editados", async () => {
    await writeFile(join(repo, "viejo.txt"), "uno\ndos\n");
    await writeFile(join(repo, "nuevo.js"), "export const a = 1;\n");

    expect((await medirForma(repo)).archivos).toBe(2);
  });
});

describe("un verificador roto no se lleva puesta la siembra", () => {
  const explota: Verificador = {
    nombre: "pantalla",
    costo: "gratis",
    async correr() {
      throw new Error("chrome no está instalado");
    },
  };

  it("si el verificador explota, se saltea y el candidato sigue vivo", async () => {
    const universo = { id: "u1", rama: "x", ruta: "/x", nacido: 0 };
    const resultado = await cruzarPorton([universo], [explota, pasa]);

    expect(resultado.candidatos[0]?.vivo).toBe(true);
    expect(resultado.candidatos[0]?.pasadas[0]?.detalle).toContain("se rompió el verificador");
  });

  it("la siembra termina y limpia aunque el portón se rompa", async () => {
    const taller = new TallerDeJuguete();

    const cosecha = await sembrar({
      tarea: "x",
      cantidad: 3,
      rama: "fix",
      taller,
      agente: agenteOk,
      verificadores: [explota],
    });

    expect(cosecha.candidatos).toHaveLength(3);
    // Solo queda abierto el worktree del ganador.
    expect(taller.abiertos.size).toBe(1);
  });

  it("un universo que no se puede abrir no deja colgados a los demás", async () => {
    const taller = new TallerDeJuguete();
    const roto = {
      abrir: async (id: string, rama: string) => {
        if (id === "u2") throw new Error("worktree add: fatal");
        return taller.abrir(id, rama);
      },
      cerrar: (u: Parameters<typeof taller.cerrar>[0]) => taller.cerrar(u),
    };

    const cosecha = await sembrar({
      tarea: "x",
      cantidad: 3,
      rama: "fix",
      taller: roto,
      agente: agenteOk,
      verificadores: [pasa],
    });

    // El que no nació figura igual: si no, desaparece sin dejar rastro.
    expect(cosecha.candidatos).toHaveLength(3);
    expect(cosecha.candidatos.find((c) => c.universo.id === "u2")?.murioEn).toBe("el taller");
    expect(cosecha.ganador).toBeDefined();
  });
});

describe("la plata gastada se informa aunque el agente falle", () => {
  const queFalla: Agente = {
    nombre: "caro",
    async trabajar() {
      throw new FalloDelAgente("se quedó sin contexto", 0.8);
    },
  };

  it("suma lo que gastó antes de romperse", async () => {
    const cosecha = await sembrar({
      tarea: "x",
      cantidad: 2,
      rama: "fix",
      taller: new TallerDeJuguete(),
      agente: queFalla,
      verificadores: [pasa],
    });

    expect(cosecha.gastado).toBeCloseTo(1.6, 4);
  });

  it("el que quemó tokens NO cuenta como muerto gratis", async () => {
    const cosecha = await sembrar({
      tarea: "x",
      cantidad: 2,
      rama: "fix",
      taller: new TallerDeJuguete(),
      agente: queFalla,
      verificadores: [pasa],
    });

    // Es la métrica que el producto pone de titular: inflarla sería mentir.
    expect(cosecha.muertosGratis).toBe(0);
  });
});

describe("la cosecha no guarda secretos", () => {
  it("la contraseña de la base no llega al disco ni a la API", async () => {
    const repo = await mkdtemp(join(tmpdir(), "dolphin-secreto-"));
    try {
      const candidato: Candidato = {
        universo: {
          id: "u1",
          rama: "x",
          ruta: "/x",
          nacido: 0,
          entorno: { DATABASE_URL: "postgres://admin:S3cretaza@db:5432/app_u1", PORT: "5001" },
        },
        vivo: true,
        pasadas: [],
      };

      await guardarCosecha(
        { tarea: "x", candidatos: [candidato], ganador: candidato, gastado: 0, muertosGratis: 0, ms: 1 },
        repo,
      );

      const guardada = await leerUltimaCosecha(repo);
      expect(JSON.stringify(guardada)).not.toContain("S3cretaza");
      expect(guardada?.candidatos[0]?.universo.entorno).toBeUndefined();
    } finally {
      await borrarCarpeta(repo);
    }
  });
});

describe("detalles que recién se ven con diez universos", () => {
  it("u9 gana el desempate contra u10, como los ordena la pantalla", () => {
    const hacer = (id: string): Candidato => ({
      universo: { id, rama: "x", ruta: "/x", nacido: 0 },
      vivo: true,
      pasadas: [],
      forma: { archivos: 1, agregadas: 1, quitadas: 0, dependenciasNuevas: 0 },
    });

    expect(elegir([hacer("u10"), hacer("u9")]).ganador?.universo.id).toBe("u9");
  });

  it("medir la línea base no explota si un verificador se rompe", async () => {
    const explota: Verificador = {
      nombre: "pantalla",
      costo: "gratis",
      async correr() {
        throw new Error("chrome no está");
      },
    };

    // Con un taller de juguete: medir en un worktree de verdad del repo de Dolphin no es asunto de este test.
    const linea = await medirLineaBase(process.cwd(), [explota], new TallerDeJuguete());
    expect(linea.sana).toBe(true);
  });
});
