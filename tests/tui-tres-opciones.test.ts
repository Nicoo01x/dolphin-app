// El CLI deja elegir TRES cosas y nada más: con qué modelo, si lo reparte un equipo, y entrar a
// ver a los agentes. Lo que se fue —Tablero, Historial, Memoria, Bandeja y Git— no tiene que
// volver sin que alguien lo decida.

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/tui/app.js";
import { MODELOS_PRINCIPALES, Sesion } from "../src/tui/sesion.js";
import { leerEntrada } from "../src/tui/teclas.js";
import { borrarCarpeta } from "./ayuda/borrar.js";

let repo: string;
beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-tres-"));
});
afterAll(async () => {
  await borrarCarpeta(repo);
});

const pantalla = (app: App, ancho = 120, alto = 36): string =>
  app.dibujar(ancho, alto).comoTexto().join("\n");

function nueva(): App {
  return new App(new Sesion({ repo, agente: "mentira", automatico: false }));
}

/** Un clic del mouse sobre una columna y fila de la pantalla. */
async function clic(app: App, x: number, y: number): Promise<void> {
  for (const e of leerEntrada(`\u001b[<0;${x + 1};${y + 1}M`)) await app.manejar(e);
}

/**
 * Dónde empieza un texto en la pantalla, como columna y fila.
 *
 * `desdeLaFila` existe porque el lema del inicio dice «Un equipo de agentes lo hace», así que
 * buscar «agentes» desde arriba encuentra la frase y no la pastilla.
 */
function donde(app: App, texto: string, desdeLaFila = 0): { x: number; y: number } {
  const lineas = app.dibujar(120, 36).comoTexto();
  for (const [y, linea] of lineas.entries()) {
    if (y < desdeLaFila) continue;
    const x = linea.indexOf(texto);
    if (x !== -1) return { x, y };
  }
  throw new Error(`no está en pantalla: ${texto}`);
}

/** La fila donde viven las tres pastillas: la de «orquesta» o «un agente». */
function filaDeLasOpciones(app: App): number {
  const lineas = app.dibujar(120, 36).comoTexto();
  const y = lineas.findIndex((l) => l.includes("orquesta") || l.includes("un agente"));
  if (y === -1) throw new Error("no están las pastillas del inicio");
  return y;
}

describe("el CLI con tres opciones", () => {
  it("la barra tiene tres secciones y ninguna de las que se sacaron", () => {
    const texto = pantalla(nueva());
    expect(texto).toContain("1 Inicio");
    expect(texto).toContain("2 Chat");
    expect(texto).toContain("3 Equipo");
    for (const ida of ["Tablero", "Historial", "Memoria", "Bandeja", "Git"]) {
      expect(texto).not.toContain(ida);
    }
  });

  it("el inicio ofrece el modelo, la orquestación y los agentes", () => {
    const texto = pantalla(nueva());
    expect(texto).toContain("orquesta");
    expect(texto).toContain("agentes");
  });

  it("un clic en la pastilla del modelo pasa al siguiente, y vuelve al del motor", async () => {
    const app = nueva();
    expect(app.sesion.lider).toBeNull();
    for (const modelo of MODELOS_PRINCIPALES) {
      const sitio = donde(app, "orquesta");
      // La pastilla del modelo está justo antes de la de orquestar, en la misma fila.
      await clic(app, Math.max(0, sitio.x - 6), sitio.y);
      expect(app.sesion.lider).toBe(modelo);
    }
    const sitio = donde(app, "orquesta");
    await clic(app, Math.max(0, sitio.x - 6), sitio.y);
    // Vuelve a «sin elegir»: si el ciclo no pasara por ahí, una vez tocada la pastilla no habría
    // forma de dejar que el motor elija.
    expect(app.sesion.lider).toBeNull();
  });

  it("un clic en la pastilla de orquestar la apaga y la prende", async () => {
    const app = nueva();
    expect(app.sesion.orquestar).toBe(true);
    const sitio = donde(app, "orquesta");
    await clic(app, sitio.x, sitio.y);
    expect(app.sesion.orquestar).toBe(false);
    expect(pantalla(app)).toContain("un agente");
    const apagada = donde(app, "un agente");
    await clic(app, apagada.x, apagada.y);
    expect(app.sesion.orquestar).toBe(true);
  });

  it("un clic en la pastilla de agentes entra a su sección", async () => {
    const app = nueva();
    const fila = filaDeLasOpciones(app);
    const sitio = donde(app, "agentes", fila);
    await clic(app, sitio.x, sitio.y);
    expect(app.vista).toBe("equipo");
  });
});
