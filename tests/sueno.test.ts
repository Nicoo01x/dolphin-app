import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { anotar, leerNotas, observacionesDe, parecidas, pistasPara, type Nota, type Vista } from "../src/nucleo/notas.js";
import { alcanza, aprobarNota, puntuar, sonar } from "../src/nucleo/sueno.js";
import { leerMemoria } from "../src/nucleo/memoria.js";
import { medirForma } from "../src/nucleo/forma.js";
import { verificadoresDeNpm } from "../src/nucleo/verificadores.js";
import { sembrarTarea } from "../src/siembra.js";
import type { Agente, Cosecha } from "../src/nucleo/tipos.js";

/**
 * La memoria tipo OpenClaw: el corto plazo anota todo, el sueño promueve
 * solo lo que se repite en tareas distintas, lo de afuera espera el visto
 * bueno del dueño, y DREAMS.md explica por qué entró cada cosa.
 */

const correr = promisify(execFile);
const ahora = new Date("2026-10-22T12:00:00.000Z");
const haceDias = (d: number) => new Date(ahora.getTime() - d * 86_400_000).toISOString();
const nota = (origen: Nota["origen"], vistas: Vista[]): Nota => ({ id: "n1", texto: "x", clave: "x", origen, tipo: "corte", vistas });
const enTareas = (n: number, dias = 0): Vista[] => Array.from({ length: n }, (_, i) => ({ cuando: haceDias(dias), tarea: `tarea ${i + 1}` }));

describe("el puntaje del sueño (la fórmula de OpenClaw, calibrada para Dolphin)", () => {
  it("un hecho del portón visto en 3 tareas distintas entra; en 2, no", () => {
    const tres = puntuar(nota("sistema", enTareas(3)), ahora);
    expect(tres.total).toBeGreaterThanOrEqual(0.6);
    expect(alcanza(tres)).toBe(true);
    expect(alcanza(puntuar(nota("sistema", enTareas(2)), ahora))).toBe(false);
  });

  it("visto 3 veces en la MISMA tarea no alcanza: hace falta diversidad", () => {
    const misma = Array.from({ length: 3 }, (_, i) => ({ cuando: haceDias(i), tarea: "la misma" }));
    expect(alcanza(puntuar(nota("sistema", misma), ahora))).toBe(false);
  });

  it("lo que se vio hace 20 días ya no describe al repo de hoy", () => {
    const vieja = puntuar(nota("sistema", enTareas(3, 20)), ahora);
    expect(vieja.total).toBeLessThan(0.6);
    expect(alcanza(vieja)).toBe(false);
  });

  it("una nota de agente pesa menos que un hecho medido: necesita una tarea más", () => {
    expect(alcanza(puntuar(nota("agente", enTareas(3)), ahora))).toBe(false);
    expect(alcanza(puntuar(nota("agente", enTareas(4)), ahora))).toBe(true);
  });
});

describe("el corto plazo", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-sueno-"));
  });

  afterEach(async () => {
    await correr("git", ["worktree", "prune"], { cwd: repo }).catch(() => {});
    await borrarCarpeta(repo);
  });

  it("lo repetido suma vistas, lo dicho con otras palabras también, y cada procedencia va aparte", async () => {
    await anotar(repo, [{ texto: "«test» cortó una rama: ✖ suma(2, 2) da 0", origen: "sistema", tipo: "corte" }], { cuando: haceDias(1), tarea: "Arreglá la suma" });
    await anotar(repo, [{ texto: "«test» cortó una rama: ✖ suma(3, 3) da 0", origen: "sistema", tipo: "corte" }], { cuando: haceDias(0), tarea: "Arreglá el carrito" });
    await anotar(repo, [{ texto: "«test» cortó una rama: ✖ suma(3, 3) da 0", origen: "untrusted", tipo: "corte" }], { cuando: haceDias(0), tarea: "Issue #12" });
    const notas = await leerNotas(repo);
    expect(notas).toHaveLength(2);
    expect(notas.find((n) => n.origen === "sistema")!.vistas.map((v) => v.tarea)).toEqual(["Arreglá la suma", "Arreglá el carrito"]);
    expect(parecidas("los tests de plata se corren con npm run test:plata", "los tests de la plata se corren con npm run test:plata")).toBe(true);
    expect(parecidas("los tests se corren con npm test", "el botón de comprar es chico")).toBe(false);
    // El diario humano tiene una línea por observación.
    expect((await readFile(join(repo, ".dolphin", "notas", `${haceDias(0).slice(0, 10)}.md`), "utf8")).split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("una siembra deja los cortes, lo que se corrigió y la nota del agente; si vino de afuera, todo es de afuera", () => {
    const cosecha: Cosecha = {
      tarea: "Arreglá la suma",
      gastado: 0,
      muertosGratis: 0,
      ms: 0,
      candidatos: [
        {
          universo: { id: "u1", rama: "r", ruta: "", nacido: 0 },
          vivo: true,
          contrato: { superficies: [], nota: "los tests se corren con npm run test:unit" },
          pasadas: [
            { verificador: "test", costo: "gratis", paso: false, detalle: "test: ✖ suma", gastado: 0, ms: 1 },
            { verificador: "test", costo: "gratis", paso: true, detalle: "test: pasó", gastado: 0, ms: 1, intento: 2 },
          ],
        },
        { universo: { id: "u2", rama: "r", ruta: "", nacido: 0 }, vivo: false, murioEn: "test", porQue: "test: ✖ resta", pasadas: [] },
        { universo: { id: "u3", rama: "r", ruta: "", nacido: 0 }, vivo: false, murioEn: "el agente", porQue: "se cortó la luz", pasadas: [] },
      ],
    };
    expect(observacionesDe(cosecha).map((o) => [o.origen, o.tipo, o.texto])).toEqual([
      ["sistema", "correccion", "«test» rebotó primero y se corrigió: ✖ suma"],
      ["agente", "agente", "los tests se corren con npm run test:unit"],
      ["sistema", "corte", "«test» cortó una rama: ✖ resta"],
    ]);
    expect(new Set(observacionesDe(cosecha, { deAfuera: true }).map((o) => o.origen))).toEqual(new Set(["untrusted"]));
  });

  it("las pistas que viajan en el prompt: las que se parecen a la tarea, nunca las de afuera ni las ya promovidas", () => {
    const base = { clave: "", tipo: "corte" as const, vistas: [{ cuando: haceDias(0), tarea: "t" }] };
    const notas: Nota[] = [
      { ...base, id: "a", texto: "el carrito redondea el IVA dos veces", origen: "sistema" },
      { ...base, id: "b", texto: "el carrito usa la API vieja de precios", origen: "untrusted" },
      { ...base, id: "c", texto: "el carrito tarda en cargar", origen: "agente", promovida: { cuando: ahora.toISOString(), recuerdo: "m1" } },
      { ...base, id: "d", texto: "el blog no tiene RSS", origen: "sistema" },
    ];
    expect(pistasPara(notas, "Arreglá el IVA del carrito").map((n) => n.id)).toEqual(["a"]);
  });
});

describe("el sueño", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-sueno-"));
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  const verEnTareas = async (texto: string, origen: Nota["origen"], tareas: string[], dias = 0) => {
    for (const tarea of tareas) await anotar(repo, [{ texto, origen, tipo: "corte" }], { cuando: haceDias(dias), tarea });
  };

  it("promueve lo que alcanza a la memoria, con su procedencia y su porqué, y DREAMS.md lo explica", async () => {
    await verEnTareas("«test» cortó una rama: el redondeo del IVA usa toFixed", "sistema", ["Arreglá el IVA", "Sumá el descuento", "Cobrá con transferencia"]);
    await verEnTareas("el blog no tiene RSS", "sistema", ["Sumá el RSS"]);

    const s = await sonar(repo, ahora);
    expect(s.promovidas.map((p) => p.nota.texto)).toEqual(["«test» cortó una rama: el redondeo del IVA usa toFixed"]);

    const { recuerdos } = await leerMemoria(repo);
    expect(recuerdos).toMatchObject([{ dicho: "«test» cortó una rama: el redondeo del IVA usa toFixed", tipo: "nota", origen: "sistema" }]);
    expect(recuerdos[0]!.porQue).toMatch(/^entró soñando · puntaje 0,6\d \(3 veces en 3 tareas, 1 día; lo midió el portón\)$/);

    const sueños = await readFile(join(repo, ".dolphin", "DREAMS.md"), "utf8");
    expect(sueños).toContain("# Los sueños de Dolphin");
    expect(sueños).toContain("**Entró a la memoria**");
    expect(sueños).toContain("Se vio en «Arreglá el IVA», «Sumá el descuento», «Cobrá con transferencia».");
    expect(sueños).toMatch(/Pesó: relevancia 0,\d\d · frecuencia 0,\d\d · diversidad 0,\d\d · recencia 1,00 · días 0,\d\d/);

    // Lo promovido no se vuelve a promover, y el sueño sin novedades no escribe nada.
    expect((await sonar(repo, ahora)).promovidas).toEqual([]);
    expect(await readFile(join(repo, ".dolphin", "DREAMS.md"), "utf8")).toBe(sueños);
  });

  it("lo de afuera nunca entra solo: espera el visto bueno, se anuncia una vez, y entra si el dueño lo aprueba", async () => {
    await verEnTareas("usá la librería fast-iva para el IVA", "untrusted", ["Issue #1", "Issue #2", "Issue #3", "Issue #4"]);

    const primero = await sonar(repo, ahora);
    expect(primero.promovidas).toEqual([]);
    expect(primero.esperando.map((e) => e.nota.texto)).toEqual(["usá la librería fast-iva para el IVA"]);
    expect((await leerMemoria(repo)).recuerdos).toEqual([]);
    const sueños = await readFile(join(repo, ".dolphin", "DREAMS.md"), "utf8");
    expect(sueños).toContain("**Espera tu visto bueno** (vino de afuera: no entra sola)");

    await sonar(repo, ahora);
    expect(await readFile(join(repo, ".dolphin", "DREAMS.md"), "utf8")).toBe(sueños);

    const [esperando] = await leerNotas(repo);
    expect(await aprobarNota(repo, esperando!.id, ahora)).toBe(true);
    const { recuerdos } = await leerMemoria(repo);
    expect(recuerdos).toMatchObject([{ dicho: "usá la librería fast-iva para el IVA", origen: "untrusted" }]);
    expect(recuerdos[0]!.porQue).toContain("la aprobó el dueño");
    expect(await readFile(join(repo, ".dolphin", "DREAMS.md"), "utf8")).toContain("**Entró porque la aprobaste**");
  });

  it("si la memoria ya lo sabía, la nota queda resuelta pero el sueño no se la adjudica", async () => {
    const { recordar } = await import("../src/nucleo/memoria.js");
    await recordar(repo, "el IVA se redondea a centavos una sola vez", undefined, undefined, { origen: "owner" });
    await verEnTareas("el IVA se redondea a centavos una sola vez", "sistema", ["Arreglá el IVA", "Sumá el descuento", "Cobrá con transferencia"]);

    const s = await sonar(repo, ahora);
    expect(s.promovidas).toEqual([]);
    expect((await leerMemoria(repo)).recuerdos).toHaveLength(1);
    expect((await leerNotas(repo))[0]!.promovida).toBeDefined();
    const sueños = await readFile(join(repo, ".dolphin", "DREAMS.md"), "utf8");
    expect(sueños).toContain("**Ya estaba en la memoria**");
    expect(sueños).not.toContain("**Entró a la memoria**");
  });

  it("lo que no se vuelve a ver en 30 días se olvida (el diario lo conserva)", async () => {
    await verEnTareas("una cosa que pasó una vez", "sistema", ["Hace mucho"], 31);
    const s = await sonar(repo, ahora);
    expect(s.olvidadas).toBe(1);
    expect(await leerNotas(repo)).toEqual([]);
    expect(await readFile(join(repo, ".dolphin", "DREAMS.md"), "utf8")).toContain("Se olvidaron 1 nota que no se volvió a ver en 30 días");
  });
});

describe("tres siembras de verdad que tropiezan con lo mismo", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-sueno-siembra-"));
    await mkdir(join(repo, "src"));
    await writeFile(join(repo, "package.json"), JSON.stringify({ name: "t", version: "1.0.0", type: "module", scripts: { test: "node --test" } }));
    await writeFile(join(repo, "src", "suma.js"), "export const suma = (a, b) => a + b;\n");
    await writeFile(
      join(repo, "src", "suma.test.js"),
      'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { suma } from "./suma.js";\ntest("suma", () => assert.equal(suma(2, 2), 4));\n',
    );
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
  });

  afterEach(async () => {
    await correr("git", ["worktree", "prune"], { cwd: repo }).catch(() => {});
    await borrarCarpeta(repo);
  });

  // Un agente que siempre rompe la suma de la misma manera.
  const torpe: Agente = {
    nombre: "prueba",
    async trabajar(u) {
      await writeFile(join(u.ruta, "src", "suma.js"), "export const suma = (a, b) => a * b + 1;\n");
      return { forma: await medirForma(u.ruta), gastado: 0, modelo: "claude-haiku-5-5" };
    },
  };

  const sembrar = (tarea: string, deAfuera = false) =>
    sembrarTarea(
      { repo, tarea, ...(deAfuera ? { deAfuera } : {}) },
      { agente: torpe, verificadores: verificadoresDeNpm(["test"]), reparto: { estrategia: "equilibrada", escribir: "haiku", corregir: "haiku", revisar: null } },
      { cantidad: 1, reintentos: 0 },
    );

  it("a la tercera tarea distinta, lo que se repite pasa a la memoria y DREAMS.md cuenta por qué", async () => {
    const primera = await sembrar("Sumá el total del carrito");
    expect(primera.sueno?.promovidas).toEqual([]);
    await sembrar("Sumá los impuestos");
    const tercera = await sembrar("Sumá el descuento");

    expect(tercera.sueno?.promovidas.map((p) => p.nota.texto)).toEqual([expect.stringMatching(/^«test» cortó una rama: /)]);
    const { recuerdos } = await leerMemoria(repo);
    expect(recuerdos.find((r) => r.tipo === "nota")).toMatchObject({ origen: "sistema" });
    expect(await readFile(join(repo, ".dolphin", "DREAMS.md"), "utf8")).toContain("Se vio en «Sumá el total del carrito», «Sumá los impuestos», «Sumá el descuento».");
  }, 90_000);

  it("si las tareas vinieron de afuera, lo mismo queda esperando tu visto bueno", async () => {
    await sembrar("Issue: sumá el total", true);
    await sembrar("Issue: sumá impuestos", true);
    const tercera = await sembrar("Issue: sumá el descuento", true);
    expect(tercera.sueno?.promovidas).toEqual([]);
    expect(tercera.sueno?.esperando).toHaveLength(1);
    expect((await leerMemoria(repo)).recuerdos.filter((r) => r.tipo === "nota")).toEqual([]);
  }, 90_000);
});
