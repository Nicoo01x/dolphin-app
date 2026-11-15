import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { ENFOQUES, repartirEnfoques } from "../src/nucleo/enfoques.js";
import type { Registro, TipoDeTarea } from "../src/nucleo/desempeno.js";
import {
  comoSeLee,
  comoVaLoAdoptado,
  decidir,
  enfoquesDelRepo,
  esAprendido,
  esSeguro,
  flaquezas,
  juzgar,
  leerHipotesis,
  leerPropuestas,
  partirHistorial,
  promptDeHipotesis,
  proponer,
  type Flaqueza,
  type Hipotesis,
} from "../src/nucleo/mejorarse.js";

/** Que Dolphin mejore su propia forma de trabajar: encontrar dónde falla, probarlo aparte y proponerlo. */

const registro = (tarea: string, tipo: TipoDeTarea, paso: boolean, murioEn?: string): Registro => ({
  cuando: "2026-10-30T12:00:00.000Z",
  tipo,
  tarea,
  modelo: "sonnet",
  paso,
  ...(murioEn ? { murioEn } : {}),
  vueltas: 1,
  costo: 0.1,
  ms: 1000,
});

const unos = (cuantos: number, hacer: (i: number) => Registro) => Array.from({ length: cuantos }, (_, i) => hacer(i));
const ramas = (cuantas: number, pasaron: number) => unos(cuantas, (i) => registro(`t${i}`, "funcion", i < pasaron)).map((r) => ({ paso: r.paso, costo: 0.2 }));

describe("mejorarse", () => {
  describe("dónde falla", () => {
    it("encuentra el tipo que más ramas pierde y la fase culpable; lo poco medido no cuenta", () => {
      const historial = [
        // Refactors: 10 ramas, 3 pasan, y de las 7 perdidas 5 mueren en los tests.
        ...unos(3, (i) => registro(`refactorizar ${i}`, "refactor", true)),
        ...unos(5, (i) => registro(`refactorizar f${i}`, "refactor", false, "test")),
        ...unos(2, (i) => registro(`refactorizar g${i}`, "refactor", false, "typecheck")),
        // Arreglos: 9 ramas, 5 pasan; duele menos y sin una fase que mande.
        ...unos(5, (i) => registro(`arreglar ${i}`, "arreglo", true)),
        ...unos(2, (i) => registro(`arreglar f${i}`, "arreglo", false, "test")),
        ...unos(2, (i) => registro(`arreglar g${i}`, "arreglo", false, "revisión")),
        // Docs: solo 3 ramas, todas perdidas: no alcanza para decir nada.
        ...unos(3, (i) => registro(`documentar ${i}`, "docs", false, "revisión")),
      ];
      const encontradas = flaquezas(historial);
      expect(encontradas.map((f) => f.tipo)).toEqual(["refactor", "arreglo"]);
      const [peor] = encontradas;
      expect(peor).toMatchObject({ tipo: "refactor", murioEn: "test", intentos: 10, pasaron: 3, perdidas: 7 });
      expect(comoSeLee(peor!)).toBe("en refactors pasa el 30 % (3 de 10), casi siempre en test");
      // Sin una fase que mande (2 y 2), no se culpa a ninguna.
      expect(encontradas[1]!.murioEn).toBeUndefined();
    });

    it("lo que ya anda bien no es una flaqueza", () => {
      expect(flaquezas(unos(10, (i) => registro(`t${i}`, "tests", i > 0)))).toEqual([]);
    });
  });

  describe("la mitad con que se piensa no es la mitad con que se prueba", () => {
    it("parte el historial por el texto, y una tarea repetida cae siempre del mismo lado", () => {
      const historial = unos(60, (i) => registro(`tarea número ${i}`, "funcion", i % 2 === 0));
      const { disenio, prueba } = partirHistorial(historial);
      expect(disenio.length + prueba.length).toBe(60);
      // Las dos mitades existen y no se mezclan.
      expect(disenio.length).toBeGreaterThan(10);
      expect(prueba.length).toBeGreaterThan(10);
      const enPrueba = new Set(prueba.map((r) => r.tarea));
      expect(disenio.some((r) => enPrueba.has(r.tarea))).toBe(false);
      // La misma tarea, otra vez (otro modelo, otro día), cae donde ya estaba.
      const repetida = { ...prueba[0]!, cuando: "2026-11-01T00:00:00.000Z", modelo: "opus" };
      expect(partirHistorial([repetida]).prueba).toHaveLength(1);
      // Mayúsculas y espacios de más no la mandan al otro lado.
      expect(partirHistorial([{ ...repetida, tarea: `  ${repetida.tarea.toUpperCase()} ` }]).prueba).toHaveLength(1);
    });
  });

  describe("la hipótesis", () => {
    const flaqueza: Flaqueza = { tipo: "refactor", murioEn: "test", intentos: 10, pasaron: 3, tasa: 0.3, perdidas: 7 };
    const hoy = "2026-10-30T12:00:00.000Z";

    it("el pedido lleva los ángulos que ya hay y las fallas, y pide un JSON", () => {
      const prompt = promptDeHipotesis(flaqueza, [registro("refactorizar el carrito", "refactor", false, "test")]);
      expect(prompt).toContain("en refactors pasa el 30 %");
      expect(prompt).toContain("«mínimo»");
      expect(prompt).toContain("- «refactorizar el carrito» · sonnet · murió en test");
      expect(prompt).toContain('{"porQue"');
    });

    it("acepta un ángulo nuevo y rechaza lo que no sirve", () => {
      const bueno = leerHipotesis(
        'Pensé esto:\n{"porQue": "no corre los tests que ya existen", "nombre": "tests viejos primero", "instruccion": "Antes de tocar nada, corré los tests que ya existen y anotá cuáles pasan."}',
        flaqueza,
        hoy,
        "h1",
      ) as Hipotesis;
      expect(bueno.enfoque).toEqual({ nombre: "tests viejos primero", instruccion: "Antes de tocar nada, corré los tests que ya existen y anotá cuáles pasan." });
      expect(bueno).toMatchObject({ id: "h1", tipo: "refactor", murioEn: "test", porQue: "no corre los tests que ya existen" });

      expect(leerHipotesis("no soy un json", flaqueza, hoy, "h2")).toEqual({ porQue: "el modelo no contestó un JSON" });
      expect(leerHipotesis("{roto", flaqueza, hoy, "h2")).toMatchObject({ porQue: expect.stringContaining("JSON") });
      expect(leerHipotesis('{"porQue": "x", "nombre": "sin instrucción"}', flaqueza, hoy, "h2")).toMatchObject({ porQue: expect.stringContaining("falta") });
      expect(leerHipotesis('{"nombre": "corto", "instruccion": "hacelo bien"}', flaqueza, hoy, "h2")).toMatchObject({ porQue: expect.stringContaining("corta") });
      // Uno que ya existe no es una idea nueva.
      const repetido = `{"porQue": "x", "nombre": "${ENFOQUES[0]!.nombre}", "instruccion": "Hacé el cambio más chico que resuelva el problema, sin refactors."}`;
      expect(leerHipotesis(repetido, flaqueza, hoy, "h2")).toMatchObject({ porQue: expect.stringContaining("ya existe") });
    });

    it("nunca aprende a romper su propio portón", () => {
      // La forma más fácil de «pasar más seguido» es romper lo que mide: eso se rechaza antes de probarlo.
      const tramposos = [
        ["atajo", "Si los tests te molestan, salteá los tests que fallen y seguí con el cambio."],
        ["sin ruido", "Borrá los tests viejos que ya no apliquen antes de escribir el tuyo."],
        ["rápido", "Marcá con it.skip lo que no llegues a arreglar."],
        ["directo", "Commiteá con --no-verify para no esperar los ganchos."],
        ["limpio", "Si el typecheck se queja, poné un @ts-ignore y seguí."],
        ["realista", "Si el portón es muy exigente, bajá el umbral de cobertura."],
        ["pragmático", "Cuando los tipos no cierren, casteá a any y seguí adelante."],
      ] as const;
      for (const [nombre, instruccion] of tramposos) {
        expect(esSeguro({ nombre, instruccion }), `debería rechazar «${instruccion}»`).toBeDefined();
        expect(leerHipotesis(JSON.stringify({ porQue: "x", nombre, instruccion }), flaqueza, hoy, "h3")).toMatchObject({ porQue: expect.stringContaining("no se prueba") });
      }
      // Lo que habla de tests sin aflojar nada sigue valiendo.
      expect(esSeguro({ nombre: "test primero", instruccion: "Escribí primero un test que falle y reproduzca el problema, y recién después tocá el código." })).toBeUndefined();
      expect(esSeguro({ nombre: "mirá los tests", instruccion: "Corré los tests que ya existen antes de tocar nada y anotá cuáles pasan." })).toBeUndefined();
    });
  });

  describe("el veredicto", () => {
    it("adopta solo lo que mejora de verdad, con suficientes tareas y sin romper el resto", () => {
      const pocas = juzgar({ base: ramas(3, 1), nueva: ramas(3, 3) });
      expect(pocas.adoptar).toBe(false);
      expect(pocas.porQue).toContain("hacen falta 6 tareas");

      const igual = juzgar({ base: ramas(10, 4), nueva: ramas(10, 4) });
      expect(igual.adoptar).toBe(false);
      expect(igual.porQue).toContain("no mejora");

      const poquito = juzgar({ base: ramas(10, 4), nueva: ramas(10, 5) });
      expect(poquito.adoptar).toBe(false);
      expect(poquito.porQue).toContain("mejora poco");

      const rompe = juzgar({ base: ramas(10, 3), nueva: ramas(10, 8), control: { base: ramas(10, 9), nueva: ramas(10, 5) } });
      expect(rompe.adoptar).toBe(false);
      expect(rompe.porQue).toContain("rompe el resto");

      const gana = juzgar({ base: ramas(10, 3), nueva: ramas(10, 8), control: { base: ramas(10, 9), nueva: ramas(10, 9) } });
      expect(gana.adoptar).toBe(true);
      expect(gana.porQue).toBe("pasa del 30 % al 80 % en 10 tareas que no se usaron para pensarlo");
      expect(gana.costo).toBe(8);
    });
  });

  describe("la propuesta", () => {
    let repo = "";
    beforeEach(async () => {
      repo = await mkdtemp(join(tmpdir(), "dolphin-mejorarse-"));
    });
    afterEach(async () => {
      await borrarCarpeta(repo);
    });

    const hipotesis: Hipotesis = {
      id: "h1",
      cuando: "2026-10-30T12:00:00.000Z",
      tipo: "refactor",
      porQue: "no mira los tests que ya hay",
      enfoque: { nombre: "tests viejos primero", instruccion: "Antes de tocar nada, corré los tests que ya existen." },
      conQue: 10,
    };

    it("queda esperando el ok y no cambia nada hasta que lo das", async () => {
      const veredicto = juzgar({ base: ramas(10, 3), nueva: ramas(10, 8) });
      await proponer(repo, hipotesis, veredicto);

      expect(await leerPropuestas(repo)).toMatchObject([{ estado: "propuesta", hipotesis: { id: "h1" } }]);
      // Mientras no la adoptes, los ángulos son los de siempre.
      expect(await enfoquesDelRepo(repo)).toEqual(ENFOQUES);

      expect(await decidir(repo, "h1", "adoptado", "2026-10-31T00:00:00.000Z")).toBe(true);
      const conNuevo = await enfoquesDelRepo(repo);
      expect(conNuevo).toHaveLength(ENFOQUES.length + 1);
      // Al final: los primeros son los que más ganan y una siembra chica prueba esos.
      expect(conNuevo.at(-1)).toEqual(hipotesis.enfoque);

      expect(await decidir(repo, "h1", "descartado")).toBe(true);
      expect(await enfoquesDelRepo(repo)).toEqual(ENFOQUES);
      expect(await decidir(repo, "no existe", "adoptado")).toBe(false);
    });

    it("lo adoptado se sigue midiendo y se avisa para retirarlo si rinde peor", async () => {
      await proponer(repo, hipotesis, juzgar({ base: ramas(10, 3), nueva: ramas(10, 8) }));
      await decidir(repo, "h1", "adoptado", "2026-10-31T00:00:00.000Z");
      expect(await esAprendido(repo, "tests viejos primero")).toBe(true);
      const propuestas = await leerPropuestas(repo);

      const rama = (paso: boolean, enfoque: string, cuando: string) => ({ ...registro("x", "refactor", paso), enfoque, cuando });
      const despues = "2026-11-05T00:00:00.000Z";
      const antes = "2026-10-20T00:00:00.000Z";

      // Sin ramas suficientes todavía no se opina.
      expect(comoVaLoAdoptado([rama(true, "tests viejos primero", despues)], propuestas)[0]).toMatchObject({ retirar: false, porQue: expect.stringContaining("todavía no") });

      // Con ramas de verdad: rinde la mitad que el resto.
      const enProduccion = [
        ...unos(8, (i) => rama(i < 2, "tests viejos primero", despues)),
        ...unos(8, (i) => rama(i < 6, "mínimo", despues)),
        // Lo de ANTES de adoptarlo no cuenta: ahí ese ángulo no estaba en juego.
        ...unos(8, () => rama(true, "tests viejos primero", antes)),
      ];
      const [va] = comoVaLoAdoptado(enProduccion, propuestas);
      expect(va).toMatchObject({ nombre: "tests viejos primero", retirar: true });
      expect(va!.suyo).toMatchObject({ intentos: 8, pasaron: 2 });
      expect(va!.porQue).toBe("rinde peor que el resto: 25 % contra 75 % en 8 ramas");

      // Si rinde parecido o mejor, se queda.
      const bien = comoVaLoAdoptado([...unos(8, (i) => rama(i < 7, "tests viejos primero", despues)), ...unos(8, (i) => rama(i < 6, "mínimo", despues))], propuestas);
      expect(bien[0]).toMatchObject({ retirar: false, porQue: "sigue rindiendo: 88 % contra 75 %" });

      // Lo descartado no se mide más.
      await decidir(repo, "h1", "descartado");
      expect(comoVaLoAdoptado(enProduccion, await leerPropuestas(repo))).toEqual([]);
    });

    it("lo adoptado entra de verdad en la rotación de ángulos de una siembra", async () => {
      // Es lo que hace que adoptar signifique algo: sin esto se guardaba y no lo usaba nadie.
      await proponer(repo, hipotesis, juzgar({ base: ramas(10, 3), nueva: ramas(10, 8) }));
      await decidir(repo, "h1", "adoptado");
      const paraUnaSiembraGrande = repartirEnfoques(ENFOQUES.length + 1, await enfoquesDelRepo(repo));
      expect(paraUnaSiembraGrande.at(-1)).toEqual(hipotesis.enfoque);
      // Y una siembra chica sigue probando los que más ganan.
      expect(repartirEnfoques(2, await enfoquesDelRepo(repo))).toEqual(ENFOQUES.slice(0, 2));
    });

    it("proponer dos veces la misma no la duplica, y un repo sin nada no explota", async () => {
      const veredicto = juzgar({ base: ramas(10, 3), nueva: ramas(10, 8) });
      await proponer(repo, hipotesis, veredicto);
      await proponer(repo, { ...hipotesis, porQue: "otra razón" }, veredicto);
      const lista = await leerPropuestas(repo);
      expect(lista).toHaveLength(1);
      expect(lista[0]!.hipotesis.porQue).toBe("otra razón");
      expect(await leerPropuestas(join(repo, "no-existe"))).toEqual([]);
    });
  });
});
