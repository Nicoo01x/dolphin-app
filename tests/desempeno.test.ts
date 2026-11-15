import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  leerDesempeno,
  registrarDesempeno,
  registrosDeCosecha,
  rendimientoPorModelo,
  tipoDeTarea,
  type Registro,
  type Rendimiento,
} from "../src/nucleo/desempeno.js";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { repartir } from "../src/nucleo/router.js";
import { medirForma } from "../src/nucleo/forma.js";
import { MEDIR_CADA, prepararSiembra, quienMide, sembrarTarea, type SiembraPreparada } from "../src/siembra.js";
import { verificadoresDeNpm } from "../src/nucleo/verificadores.js";
import type { Agente, Candidato, Cosecha } from "../src/nucleo/tipos.js";

/**
 * Las cifras propias: cada rama escrita deja su fila, y el router las
 * consulta para decidir quién escribe según la estrategia.
 */

const correr = promisify(execFile);

describe("de qué tipo es una tarea", () => {
  it.each([
    ["Arreglá la suma: suma(2, 2) da 0", "arreglo"],
    ["Arreglá la suma, el test de la suma falla", "arreglo"],
    ["El total sale con el IVA dos veces, corregilo", "arreglo"],
    ["Sumá tests para el parser de fechas", "tests"],
    ["Escribile pruebas al cálculo del IVA", "tests"],
    ["Subí la cobertura del módulo de pagos", "tests"],
    ["El botón de comprar es muy chico en el celular", "pantalla"],
    ["Que la tabla sea responsive", "pantalla"],
    ["Actualizá el README con el quickstart", "docs"],
    ["Renombrá calcular a calcularTotal", "refactor"],
    ["Exportá las ventas a CSV", "funcion"],
  ] as const)("«%s» → %s", (tarea, tipo) => {
    expect(tipoDeTarea(tarea)).toBe(tipo);
  });
});

const candidato = (id: string, extra: Partial<Candidato>): Candidato => ({
  universo: { id, rama: `dolphin/x/${id}`, ruta: `/tmp/${id}`, nacido: 0 },
  vivo: true,
  pasadas: [],
  ...extra,
});

const cosechaDe = (candidatos: Candidato[], tarea = "Arreglá la suma"): Cosecha => ({
  tarea,
  candidatos,
  gastado: 0,
  muertosGratis: 0,
  ms: 0,
});

describe("las filas que deja una cosecha", () => {
  it("una por rama escrita, con el costo entero y las vueltas; afuera lo que no dice nada del modelo", () => {
    const cosecha = cosechaDe([
      candidato("u1", {
        modelo: "claude-sonnet-5-5",
        gastadoAgente: 0.05,
        msAgente: 9000,
        pasadas: [
          { verificador: "test", costo: "gratis", paso: false, detalle: "falla", gastado: 0, ms: 500 },
          { verificador: "test", costo: "gratis", paso: true, detalle: "ok", gastado: 0, ms: 400, intento: 2 },
          { verificador: "revisión", costo: "barato", paso: true, detalle: "ok", gastado: 0.01, ms: 1100, intento: 2 },
        ],
      }),
      candidato("u2", {
        modelo: "claude-haiku-5-5",
        vivo: false,
        murioEn: "test",
        gastadoAgente: 0.004,
        msAgente: 3000,
        pasadas: [{ verificador: "test", costo: "gratis", paso: false, detalle: "falla", gastado: 0, ms: 300 }],
      }),
      candidato("u3", { modelo: "claude-sonnet-5-5", deCache: true, ahorro: 0.05 }), // de la memoria: no lo escribió nadie
      candidato("u4", { modelo: "demo" }), // el agente de prueba
      candidato("u5", { modelo: "claude-opus-5-5", vivo: false, murioEn: "el agente" }), // se cayó escribiendo
    ]);

    expect(registrosDeCosecha(cosecha, "2026-10-21T23:00:00.000Z")).toEqual([
      { cuando: "2026-10-21T23:00:00.000Z", tipo: "arreglo", tarea: "Arreglá la suma", modelo: "claude-sonnet-5-5", paso: true, vueltas: 2, costo: 0.06, ms: 11000 },
      { cuando: "2026-10-21T23:00:00.000Z", tipo: "arreglo", tarea: "Arreglá la suma", modelo: "claude-haiku-5-5", paso: false, murioEn: "test", vueltas: 1, costo: 0.004, ms: 3300 },
    ]);
  });

  it("la rama de un motor que no informa su costo queda marcada: su cero no es «gratis»", () => {
    const cosecha = cosechaDe([
      candidato("u1", {
        modelo: "codex",
        costoDesconocido: true,
        tokens: { entrada: 20261, salida: 900 },
        msAgente: 8000,
        pasadas: [{ verificador: "revisión", costo: "barato", paso: true, detalle: "ok", gastado: 0.01, ms: 1000 }],
      }),
    ]);
    // El costo que queda es el de la revisión (Claude sí lo dice); el de Codex no se sabe.
    expect(registrosDeCosecha(cosecha, "2026-10-22T07:00:00.000Z")[0]).toMatchObject({ modelo: "codex", costo: 0.01, costoDesconocido: true });
  });
});

describe("el rendimiento de cada modelo", () => {
  const fila = (modelo: string, paso: boolean, costo: number, extra: Partial<Registro> = {}): Registro => ({
    cuando: "2026-10-21T00:00:00.000Z",
    tipo: "arreglo",
    tarea: "x",
    modelo,
    paso,
    vueltas: 1,
    costo,
    ms: 1000,
    ...extra,
  });

  it("cuenta por familia, y el costo por rama que pasa es todo lo gastado sobre las que pasaron", () => {
    const registros = [
      fila("claude-sonnet-5-5", true, 0.1),
      fila("sonnet", true, 0.1, { vueltas: 2 }),
      fila("claude-sonnet-5-5", false, 0.1),
      fila("claude-haiku-5-5", false, 0.01),
      fila("claude-haiku-5-5", true, 0.01, { tipo: "pantalla" }),
    ];
    const enArreglos = rendimientoPorModelo(registros, "arreglo");
    expect(enArreglos.map((r) => r.modelo)).toEqual(["sonnet", "haiku"]);
    expect(enArreglos[0]).toMatchObject({ intentos: 3, pasaron: 2, aLaPrimera: 1 });
    expect(enArreglos[0]!.tasa).toBeCloseTo(2 / 3);
    expect(enArreglos[0]!.costoPorAcierto).toBeCloseTo(0.15);
    // Ninguna de haiku pasó en arreglos: no hay costo por acierto que dar.
    expect(enArreglos[1]).toMatchObject({ intentos: 1, pasaron: 0, costoPorAcierto: null });
    // Sin tipo, cuenta todo.
    expect(rendimientoPorModelo(registros).find((r) => r.modelo === "haiku")).toMatchObject({ intentos: 2, pasaron: 1 });
  });

  it("lo que no informó su costo queda afuera de la plata: sin ninguna cifra es «sin dato», no gratis", () => {
    const registros = [
      fila("codex", true, 0, { costoDesconocido: true }),
      fila("codex", true, 0, { costoDesconocido: true }),
      fila("claude-haiku-5-5", true, 0.02),
      // Un día el CLI no dijo cuánto costó: esa rama cuenta para la tasa, no para la plata.
      fila("claude-haiku-5-5", true, 0, { costoDesconocido: true }),
    ];
    const [codex, haiku] = ["codex", "haiku"].map((m) => rendimientoPorModelo(registros).find((r) => r.modelo === m));
    expect(codex).toMatchObject({ intentos: 2, pasaron: 2, tasa: 1, costoMedio: null, costoPorAcierto: null, sinCosto: 2 });
    expect(haiku).toMatchObject({ intentos: 2, pasaron: 2, costoMedio: 0.02, costoPorAcierto: 0.02, sinCosto: 1 });
  });
});

describe("el router con cifras propias: las tres estrategias", () => {
  const medido = (modelo: string, pasaron: number, costoPorAcierto: number | null, intentos = 10): Rendimiento => ({
    modelo,
    intentos,
    pasaron,
    aLaPrimera: pasaron,
    tasa: pasaron / intentos,
    costoMedio: costoPorAcierto === null ? 0.05 : (costoPorAcierto * pasaron) / intentos,
    costoPorAcierto,
    msMedio: 1000,
  });
  const datos = (...rendimientos: Rendimiento[]) => ({ tipo: "arreglo" as const, rendimientos });
  const parejos = datos(medido("opus", 9, 0.4), medido("sonnet", 8, 0.1), medido("haiku", 7, 0.03));

  it("calidad sigue con Opus si nadie pasa claramente más", () => {
    const r = repartir("claude", { estrategia: "calidad" }, {}, parejos);
    expect(r.escribir).toBe("opus");
    expect(r.porDatos).toBe(
      "En arreglos, opus pasó 9 de 10 (US$ 0,40 por rama que pasa) y sonnet pasó 8 de 10 (US$ 0,10 por rama que pasa): con la estrategia calidad, sigue escribiendo opus.",
    );
    expect(r.explorar).toBeUndefined(); // calidad no gasta en medir
  });

  it("calidad cambia a Sonnet si en este tipo de tarea pasa claramente más que Opus", () => {
    const r = repartir("claude", { estrategia: "calidad" }, {}, datos(medido("opus", 6, 0.6), medido("sonnet", 9, 0.1)));
    expect(r.escribir).toBe("sonnet");
    expect(r.porDatos).toContain("escribe sonnet en vez de opus");
  });

  it("el mismo margen decide igual arriba y abajo de la tabla: 3 contra 2 de 10 es como 8 contra 7", () => {
    // En coma flotante 0,2 + 0,1 no es 0,3: antes 8/10 contra 7/10 bajaba a Haiku y 3/10 contra 2/10, no.
    const arriba = repartir("claude", { estrategia: "equilibrada" }, {}, datos(medido("sonnet", 8, 0.1), medido("haiku", 7, 0.02)));
    const abajo = repartir("claude", { estrategia: "equilibrada" }, {}, datos(medido("sonnet", 3, 0.1), medido("haiku", 2, 0.02)));
    expect(arriba.escribir).toBe("haiku");
    expect(abajo.escribir).toBe("haiku");
  });

  it("equilibrada se queda con Sonnet si Haiku pasa bastante menos, aunque sea más barato", () => {
    const r = repartir("claude", { estrategia: "equilibrada" }, {}, parejos);
    expect(r).toMatchObject({ escribir: "sonnet", revisar: "haiku" });
    expect(r.porDatos).toContain("sigue escribiendo sonnet");
  });

  it("equilibrada baja a Haiku si pasa casi lo mismo por menos, y la revisión sube a Sonnet", () => {
    const r = repartir("claude", { estrategia: "equilibrada" }, {}, datos(medido("sonnet", 9, 0.1), medido("haiku", 8, 0.02)));
    expect(r).toMatchObject({ escribir: "haiku", corregir: "sonnet", revisar: "sonnet" });
    expect(r.porDatos).toBe(
      "En arreglos, haiku pasó 8 de 10 (US$ 0,02 por rama que pasa) y sonnet pasó 9 de 10 (US$ 0,10 por rama que pasa): con la estrategia equilibrada, escribe haiku en vez de sonnet.",
    );
  });

  it("economía se queda con Haiku mientras pase al menos la mitad", () => {
    const r = repartir("claude", { estrategia: "economia" }, {}, parejos);
    expect(r.escribir).toBe("haiku");
    expect(r.porDatos).toContain("con la estrategia economía, sigue escribiendo haiku");
  });

  it("economía sube a Sonnet si Haiku casi no pasa: barato por acierto, pero la siembra queda vacía", () => {
    const r = repartir("claude", { estrategia: "economia" }, {}, datos(medido("haiku", 2, 0.02), medido("sonnet", 8, 0.1)));
    expect(r.escribir).toBe("sonnet");
    expect(r.porDatos).toContain("escribe sonnet en vez de haiku");
  });

  it("con pocas ramas medidas no decide nada, y la siembra sale a medir al que falta", () => {
    const pocas = datos(medido("sonnet", 9, 0.1), medido("haiku", 2, 0.02, 3));
    const equilibrada = repartir("claude", { estrategia: "equilibrada" }, {}, pocas);
    expect(equilibrada).toMatchObject({ escribir: "sonnet", explorar: "haiku" });
    expect(equilibrada.porDatos).toBeUndefined();

    const economia = repartir("claude", { estrategia: "economia" }, {}, datos());
    expect(economia).toMatchObject({ escribir: "haiku", explorar: "sonnet" });
  });

  it("economía no elige por barato a uno que no informó su costo: un cero falso ganaría siempre", () => {
    const sinCosto = (modelo: string, pasaron: number): Rendimiento => ({ ...medido(modelo, pasaron, null), costoMedio: null, sinCosto: 10 });
    // El de la tabla no informó lo que cuesta: no hay con qué compararlo por plata, se queda la tabla y lo dice.
    const deTabla = repartir("claude", { estrategia: "economia" }, {}, datos(sinCosto("haiku", 9), medido("sonnet", 8, 0.1)));
    expect(deTabla.escribir).toBe("haiku");
    expect(deTabla.porDatos).toBe("En arreglos, haiku no informó lo que cuesta: con la estrategia economía, sigue escribiendo haiku.");
    // Y uno que no informó no le gana por «barato» al de la tabla, aunque pase lo mismo.
    const otro = repartir("claude", { estrategia: "equilibrada" }, {}, datos(medido("sonnet", 9, 0.1), sinCosto("haiku", 9)));
    expect(otro.escribir).toBe("sonnet");
    expect(otro.porDatos).toBeUndefined();
    // Calidad mira la tasa, no la plata: ahí el costo desconocido no cambia nada.
    expect(repartir("claude", { estrategia: "calidad" }, {}, datos(medido("opus", 6, 0.6), sinCosto("sonnet", 9))).escribir).toBe("sonnet");
  });

  it("lo fijado a mano manda sobre las cifras, y los otros motores no se tocan", () => {
    const aMano = repartir("claude", { estrategia: "equilibrada" }, { modelo: "opus" }, datos(medido("sonnet", 9, 0.1), medido("haiku", 9, 0.02)));
    expect(aMano.escribir).toBe("opus");
    expect(aMano.porDatos).toBeUndefined();
    expect(aMano.explorar).toBeUndefined();

    const codex = repartir("codex", {}, {}, datos(medido("sonnet", 9, 0.1), medido("haiku", 9, 0.02)));
    expect(codex.escribir).toBeUndefined();
    expect(codex.porDatos).toBeUndefined();
  });
});

describe("las cifras en disco", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-desempeno-"));
  });

  afterEach(async () => {
    await correr("git", ["worktree", "prune"], { cwd: repo }).catch(() => {});
    await borrarCarpeta(repo);
  });

  it("dos cosechas que terminan juntas no se pisan las filas", async () => {
    const una = cosechaDe([candidato("u1", { modelo: "claude-sonnet-5-5" })]);
    const otra = cosechaDe([candidato("u1", { modelo: "claude-haiku-5-5", vivo: false, murioEn: "test" })]);
    await Promise.all([registrarDesempeno(repo, una, "2026-10-21T01:00:00.000Z"), registrarDesempeno(repo, otra, "2026-10-21T01:00:00.000Z")]);
    expect((await leerDesempeno(repo)).map((r) => r.modelo).sort()).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    const archivo = JSON.parse(await readFile(join(repo, ".dolphin", "desempeno.json"), "utf8"));
    expect(archivo.version).toBe(1);
  });

  it("un archivo roto no tira la siembra: se lee como vacío", async () => {
    await mkdir(join(repo, ".dolphin"), { recursive: true });
    await writeFile(join(repo, ".dolphin", "desempeno.json"), "{ esto no es json");
    expect(await leerDesempeno(repo)).toEqual([]);
  });

  it("una siembra de tres con una rama que sale a medir: la última escribe con el otro modelo y quedan las tres filas", async () => {
    await mkdir(join(repo, "src"));
    await writeFile(join(repo, "package.json"), JSON.stringify({ name: "t", version: "1.0.0", type: "module", scripts: { test: "node --test" } }));
    await writeFile(join(repo, "src", "suma.js"), "export const suma = (a, b) => a - b;\n");
    await writeFile(
      join(repo, "src", "suma.test.js"),
      'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { suma } from "./suma.js";\ntest("suma", () => assert.equal(suma(2, 2), 4));\n',
    );
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }

    // Escribe con el modelo que le pida el enfoque; si no, con Sonnet. Haiku se equivoca.
    const pedidos: (string | undefined)[] = [];
    const agente: Agente = {
      nombre: "prueba",
      async trabajar(universo, _tarea, enfoque) {
        pedidos.push(enfoque?.modelo);
        const modelo = enfoque?.modelo === "haiku" ? "claude-haiku-5-5" : "claude-sonnet-5-5";
        const cuerpo = modelo === "claude-haiku-5-5" ? "a + b + 1" : "a + b";
        await writeFile(join(universo.ruta, "src", "suma.js"), `export const suma = (a, b) => ${cuerpo};\n`);
        return { forma: await medirForma(universo.ruta), gastado: modelo === "claude-haiku-5-5" ? 0.002 : 0.03, modelo };
      },
    };
    const preparada: SiembraPreparada = {
      agente,
      verificadores: verificadoresDeNpm(["test"]),
      reparto: { estrategia: "equilibrada", escribir: "sonnet", corregir: "sonnet", revisar: "haiku", explorar: "haiku" },
    };

    const { cosecha } = await sembrarTarea({ repo, tarea: "Arreglá la suma" }, preparada, { cantidad: 3, reintentos: 0 });
    expect(pedidos.sort()).toEqual(["haiku", undefined, undefined]);
    expect(cosecha.modelos?.explorar).toBe("haiku");
    expect(cosecha.candidatos.map((c) => [c.universo.id, c.modelo, c.vivo])).toEqual([
      ["u1", "claude-sonnet-5-5", true],
      ["u2", "claude-sonnet-5-5", true],
      ["u3", "claude-haiku-5-5", false],
    ]);
    // Cada rama con lo que gastó escribiendo: es la mitad grande de la cuenta.
    expect(cosecha.candidatos.map((c) => c.gastadoAgente)).toEqual([0.03, 0.03, 0.002]);

    const filas = await leerDesempeno(repo);
    expect(filas.map((f) => [f.modelo, f.paso, f.tipo])).toEqual([
      ["claude-sonnet-5-5", true, "arreglo"],
      ["claude-sonnet-5-5", true, "arreglo"],
      ["claude-haiku-5-5", false, "arreglo"],
    ]);
    expect(rendimientoPorModelo(filas, "arreglo").map((r) => [r.modelo, r.pasaron, r.intentos])).toEqual([
      ["sonnet", 2, 2],
      ["haiku", 0, 1],
    ]);
  }, 60_000);

  it("medir nunca suma ramas: con una sola, mide 1 de cada 4 siembras del tipo, y solo mientras falten cifras", async () => {
    const reparto = { estrategia: "equilibrada" as const, escribir: "sonnet", corregir: "sonnet", revisar: "haiku", explorar: "haiku" };
    expect(quienMide({ reparto }, 1)).toBeUndefined();
    expect(quienMide({ reparto, turnoDeMedir: true }, 1)).toBe("haiku");
    expect(quienMide({ reparto }, 3)).toBe("haiku");
    expect(quienMide({ reparto: { ...reparto, explorar: undefined } as never, turnoDeMedir: true }, 1)).toBeUndefined();

    // El turno sale de las filas que ya hay de este tipo de tarea: la cuarta, la octava…
    await writeFile(join(repo, "leeme.txt"), "hola\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    // Una fila por rama, con el `cuando` de su siembra: se cuentan siembras, no ramas.
    const filas = (siembras: number, ramasPorSiembra = 1) =>
      Array.from({ length: siembras * ramasPorSiembra }, (_, i) => ({
        cuando: new Date(Date.UTC(2026, 9, 21, 0, Math.floor(i / ramasPorSiembra))).toISOString(),
        tipo: "arreglo",
        tarea: "x",
        modelo: "claude-sonnet-5-5",
        paso: true,
        vueltas: 1,
        costo: 0.1,
        ms: 1,
      }));
    await mkdir(join(repo, ".dolphin"), { recursive: true });
    for (const [registros, toca] of [
      [filas(MEDIR_CADA - 2), false],
      [filas(MEDIR_CADA - 1), true],
      [filas(MEDIR_CADA), false],
      // Tres siembras de dos ramas son tres siembras: le toca medir igual que con tres de una.
      [filas(MEDIR_CADA - 1, 2), true],
    ] as const) {
      await writeFile(join(repo, ".dolphin", "desempeno.json"), JSON.stringify({ version: 1, registros }));
      const preparada = await prepararSiembra({ repo, tarea: "Arreglá la suma", agente: "claude" });
      expect(Boolean(preparada.turnoDeMedir)).toBe(toca);
    }
  });

  it("con una sola rama y el turno de medir, la única rama escribe con el modelo que se mide", async () => {
    await writeFile(join(repo, "leeme.txt"), "hola\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    const pedidos: (string | undefined)[] = [];
    const agente: Agente = {
      nombre: "prueba",
      async trabajar(universo, _tarea, enfoque) {
        pedidos.push(enfoque?.modelo);
        await writeFile(join(universo.ruta, "leeme.txt"), "hola, mundo\n");
        return { forma: await medirForma(universo.ruta), gastado: 0.001, modelo: "claude-haiku-5-5" };
      },
    };
    const { cosecha } = await sembrarTarea(
      { repo, tarea: "Saludá al mundo" },
      { agente, verificadores: [], reparto: { estrategia: "equilibrada", escribir: "sonnet", corregir: "sonnet", revisar: "haiku", explorar: "haiku" }, turnoDeMedir: true },
      { cantidad: 1 },
    );
    expect(pedidos).toEqual(["haiku"]);
    expect(cosecha.candidatos).toHaveLength(1);
    expect(cosecha.modelos?.explorar).toBe("haiku");
  }, 60_000);

  it("con dos ramas nadie sale a medir: le sacaría la mitad de las chances a la siembra", async () => {
    await writeFile(join(repo, "leeme.txt"), "hola\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    const pedidos: (string | undefined)[] = [];
    const agente: Agente = {
      nombre: "prueba",
      async trabajar(universo, _tarea, enfoque) {
        pedidos.push(enfoque?.modelo);
        await writeFile(join(universo.ruta, "leeme.txt"), "hola, mundo\n");
        return { forma: await medirForma(universo.ruta), gastado: 0.01, modelo: "claude-sonnet-5-5" };
      },
    };
    const { cosecha } = await sembrarTarea(
      { repo, tarea: "Saludá al mundo" },
      { agente, verificadores: [], reparto: { estrategia: "equilibrada", escribir: "sonnet", corregir: "sonnet", revisar: "haiku", explorar: "haiku" } },
      { cantidad: 2 },
    );
    expect(pedidos).toEqual([undefined, undefined]);
    expect(cosecha.modelos?.explorar).toBeUndefined();
  }, 60_000);
});
