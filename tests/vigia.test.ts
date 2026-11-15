import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearVigia, importa, type Vuelta } from "../src/nucleo/vigia.js";
import type { Universo, Verificador } from "../src/nucleo/tipos.js";

/**
 * El vigía sin disco ni navegador: los cambios se avisan a mano y la
 * pantalla es un verificador de mentira que «se arregla» cuando se le dice.
 *
 * El tiempo es de mentira también: con la suite entera corriendo en
 * paralelo, un timer de 20 ms llegaba tarde y el test fallaba sin que el
 * vigía tuviera nada roto. Así cada paso pasa exactamente cuando se dice.
 */

const universo: Universo = { id: "vigia", rama: "", ruta: "/app", nacido: 0 };
/** El test hace pasar el tiempo. */
const espera = (ms: number) => vi.advanceTimersByTimeAsync(ms);
/** Lo que tarda una fase de mentira: termina cuando el test hace pasar ese tiempo. */
const dormir = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function pantalla(estado: { roto: boolean; corridas: number; demoraMs?: number }): Verificador {
  return {
    nombre: "pantalla",
    costo: "gratis",
    async correr() {
      estado.corridas += 1;
      if (estado.demoraMs) await dormir(estado.demoraMs);
      return estado.roto
        ? { paso: false, detalle: "pantalla · pulgar: button «Comprar» mide 120×28 px y para el dedo hacen falta 44", gastado: 0 }
        : { paso: true, detalle: "pantalla: 5 personas, nada roto", gastado: 0 };
    },
  };
}

describe("el vigía", () => {
  it("arranca con una vuelta, encuentra el bug, y al arreglarlo vuelve a mirar solo y da verde", async () => {
    const estado = { roto: true, corridas: 0 };
    const vueltas: Vuelta[] = [];
    const vigia = crearVigia({ universo, verificadores: [pantalla(estado)], esperaMs: 20, alTerminar: (v) => vueltas.push(v) });

    const verde = vigia.hastaVerde();
    vigia.arrancar();
    await espera(50);
    expect(vueltas[0]).toMatchObject({ numero: 1, por: ["(arranque)"], verde: false });
    expect(vueltas[0]!.resultados[0]!.detalle).toContain("mide 120×28");

    // Alguien arregla el CSS: el vigía se entera por el aviso, no porque se lo pidan.
    estado.roto = false;
    vigia.avisar("estilos.css");
    await espera(50);
    const final = await verde;
    expect(final).toMatchObject({ numero: 2, por: ["estilos.css"], verde: true });
    await vigia.detener();
  });

  it("un guardado que dispara diez avisos es una sola vuelta, con todos los archivos", async () => {
    const estado = { roto: false, corridas: 0 };
    const vueltas: Vuelta[] = [];
    const vigia = crearVigia({ universo, verificadores: [pantalla(estado)], esperaMs: 30, alTerminar: (v) => vueltas.push(v) });

    for (let i = 0; i < 10; i++) vigia.avisar(i % 2 ? "a.css" : "b.html");
    await espera(120);
    expect(estado.corridas).toBe(1);
    expect([...vueltas[0]!.por].sort()).toEqual(["a.css", "b.html"]);
    await vigia.detener();
  });

  it("un cambio durante una vuelta no se pierde ni la pisa: corre una más al terminar", async () => {
    const estado = { roto: false, corridas: 0, demoraMs: 80 };
    const vueltas: Vuelta[] = [];
    const vigia = crearVigia({ universo, verificadores: [pantalla(estado)], esperaMs: 10, alTerminar: (v) => vueltas.push(v) });

    vigia.arrancar();
    await espera(20); // la primera está corriendo
    vigia.avisar("app.js");
    await espera(40); // el aviso ya venció, pero la vuelta sigue: no se lanza otra encima
    expect(estado.corridas).toBe(1);
    await espera(200);
    expect(vueltas.map((v) => v.por)).toEqual([["(arranque)"], ["app.js"]]);
    await vigia.detener();
  });

  it("muestra todas las fases en rojo, no solo la primera", async () => {
    const roto = (nombre: string): Verificador => ({
      nombre,
      costo: "gratis",
      async correr() {
        return { paso: false, detalle: `${nombre}: ✖`, gastado: 0 };
      },
    });
    const vueltas: Vuelta[] = [];
    const vigia = crearVigia({ universo, verificadores: [roto("test"), roto("pantalla")], esperaMs: 5, alTerminar: (v) => vueltas.push(v) });
    vigia.arrancar();
    await espera(40);
    expect(vueltas[0]!.resultados.map((r) => `${r.nombre}:${r.paso}`)).toEqual(["test:false", "pantalla:false"]);
    await vigia.detener();
  });

  it("no se despierta por lo que no es la app", () => {
    expect(importa("src/App.tsx")).toBe(true);
    expect(importa("estilos.css")).toBe(true);
    for (const ruido of [
      ".git/index",
      "node_modules/x/y.js",
      ".dolphin/cosechas/a.json",
      "dist/assets/a.js",
      "src\\app.tsx~",
      "src/.app.tsx.swp",
      "estilos.css.tmp.20260.f6ccaf729a65",
      "",
    ]) {
      expect(importa(ruido)).toBe(false);
    }
  });
});
