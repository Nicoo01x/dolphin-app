// La última fila dice qué está pasando mientras el agente trabaja, y los atajos el resto del
// tiempo. Medido contra el CLI de Qoder (docs/tui-de-qoder-por-dentro.md): su barra tiene 56
// textos y casi ninguno es un atajo. La nuestra decía seis atajos y nada más, así que la fila
// que más se mira no informaba nada de lo que estaba pasando.

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/tui/app.js";
import { Sesion } from "../src/tui/sesion.js";
import { borrarCarpeta } from "./ayuda/borrar.js";

let repo: string;
beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-barra-"));
});
afterAll(async () => {
  await borrarCarpeta(repo);
});

const ultimaFila = (app: App, ancho = 120, alto = 36): string =>
  app.dibujar(ancho, alto).comoTexto()[alto - 1] ?? "";

function nueva(automatico = false): App {
  return new App(new Sesion({ repo, agente: "mentira", automatico }));
}

/** Pone un trabajo en curso, como si el equipo estuviera armándose hace un rato. */
function trabajando(app: App, titulo: string, haceMs: number): void {
  app.sesion.trabajo = { tipo: "equipo", desde: Date.now() - haceMs, titulo };
}

describe("la barra de estado", () => {
  it("muestra los atajos cuando no hay nada en curso", () => {
    const fila = ultimaFila(nueva());

    expect(fila).toContain("enter");
    expect(fila).toContain("mandar");
    expect(fila).toContain("ctrl+c");
  });

  it("mientras trabaja dice qué hace, hace cuánto, y cómo cortarlo", () => {
    const app = nueva();
    trabajando(app, "Armando el equipo", 83_000);
    const fila = ultimaFila(app);

    expect(fila).toContain("Armando el equipo");
    // Why el cronómetro y el «cómo se corta» juntos: cuánto lleva esto sólo preocupa, y preocupa
    // menos sabiendo que se corta con una tecla.
    expect(fila).toContain("esc para cortar");
    expect(fila).toContain("01:23");
    // Y la barra es una sola: los atajos de siempre se van mientras tanto.
    expect(fila).not.toContain("f1");
  });

  it("dice con qué agente trabaja y si puede hacer cosas sin preguntar", () => {
    const pregunta = nueva(false);
    trabajando(pregunta, "Escribiendo", 1000);
    expect(ultimaFila(pregunta)).toContain("pregunta");

    const sinPermisos = nueva(true);
    trabajando(sinPermisos, "Escribiendo", 1000);
    // Why decirlo siempre que trabaja: sin permisos el agente borra y escribe sin avisar, y eso
    // no puede estar sólo en el comando con el que se arrancó hace una hora.
    expect(ultimaFila(sinPermisos)).toContain("sin permisos");
  });

  it("vuelve a los atajos cuando el trabajo termina", () => {
    const app = nueva();
    trabajando(app, "Armando el equipo", 1000);
    expect(ultimaFila(app)).toContain("Armando el equipo");

    app.sesion.trabajo = { ...app.sesion.trabajo!, terminado: 2000 };
    const fila = ultimaFila(app);

    expect(fila).not.toContain("Armando el equipo");
    expect(fila).toContain("mandar");
  });

  it("no deja el título pisando lo de la derecha en una pantalla angosta", () => {
    const app = nueva();
    trabajando(app, "Un título larguísimo que no entra de ninguna manera en esta fila", 1000);
    const fila = ultimaFila(app, 60);

    expect(fila.length).toBeLessThanOrEqual(60);
  });
});
