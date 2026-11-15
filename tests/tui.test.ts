import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { leerBandeja } from "../src/nucleo/bandeja.js";
import { leerMemoria } from "../src/nucleo/memoria.js";
import { leerProyectos, sumarProyecto } from "../src/nucleo/proyectos.js";
import { App } from "../src/tui/app.js";
import { anchoDeTexto, Bufer, diferencia, partirEnRenglones, recortar } from "../src/tui/celdas.js";
import { leerInstantanea } from "../src/tui/datos.js";
import { aplicarAlEquipo, equipoInicial, progresoDe } from "../src/tui/equipo-estado.js";
import { pintarDelfin3d } from "../src/tui/delfin3d.js";
import { Sesion } from "../src/tui/sesion.js";
import { leerEntrada } from "../src/tui/teclas.js";

/**
 * La app de terminal sin terminal: las teclas entran como bytes (los mismos que manda Windows
 * Terminal), la app devuelve cuadros y los cuadros se leen como texto. El equipo corre con el
 * agente de mentira sobre un repo de git de verdad: no gasta nada.
 */

describe("lo que entra por la terminal", () => {
  it("separa texto, teclas con modificadores, pegado y mouse", () => {
    expect(leerEntrada("hola")).toEqual([{ tipo: "texto", texto: "hola" }]);
    expect(leerEntrada("\x1b[A\r\x7f\x0b")).toEqual([
      { tipo: "tecla", nombre: "arriba", ctrl: false, alt: false, shift: false },
      { tipo: "tecla", nombre: "enter", ctrl: false, alt: false, shift: false },
      { tipo: "tecla", nombre: "borrar", ctrl: false, alt: false, shift: false },
      { tipo: "tecla", nombre: "k", ctrl: true, alt: false, shift: false },
    ]);
    expect(leerEntrada("\x1b[1;5C")[0]).toMatchObject({ nombre: "derecha", ctrl: true });
    expect(leerEntrada("\x1b3")[0]).toMatchObject({ tipo: "tecla", nombre: "3", alt: true });
    expect(leerEntrada("\x1b[200~uno\r\ndos\x1b[201~")).toEqual([{ tipo: "pegar", texto: "uno\ndos" }]);
    expect(leerEntrada("\x1b[<0;12;3M\x1b[<64;5;5M")).toEqual([
      { tipo: "mouse", accion: "clic", x: 11, y: 2, boton: 0 },
      { tipo: "mouse", accion: "rueda-arriba", x: 4, y: 4, boton: 0 },
    ]);
    expect(leerEntrada("\x1b")).toEqual([{ tipo: "tecla", nombre: "escape", ctrl: false, alt: false, shift: false }]);
  });
});

describe("las celdas", () => {
  it("manda solo lo que cambió entre dos cuadros", () => {
    const a = new Bufer(20, 3);
    a.texto(0, 0, "hola mundo");
    const b = new Bufer(20, 3);
    b.texto(0, 0, "hola mundo");
    b.texto(5, 1, "x", { fg: [255, 0, 0] });
    const cambio = diferencia(a, b, "truecolor");
    expect(cambio).toContain("\x1b[2;6H");
    expect(cambio).toContain("x");
    expect(cambio).not.toContain("hola");
    expect(diferencia(b, b, "truecolor")).toBe("");
    // Sin cuadro anterior va todo, con un borrado de pantalla adelante.
    expect(diferencia(null, b, "256")).toMatch(/^\x1b\[0m\x1b\[2J/);
  });

  it("mide anchos, recorta y parte renglones sin pasarse", () => {
    expect(anchoDeTexto("año")).toBe(3);
    expect(anchoDeTexto("中文")).toBe(4);
    expect(recortar("exportar pedidos a CSV", 10)).toBe("exportar …");
    for (const r of partirEnRenglones("una tarea bastante larga para partir en renglones cortos", 12)) expect(anchoDeTexto(r)).toBeLessThanOrEqual(12);
  });

  it("el delfín es de puntos braille, gira (cambia con el tiempo) y es el mismo cuadro para el mismo instante", () => {
    const pintar = (t: number) => {
      const b = new Bufer(50, 20);
      pintarDelfin3d(b, 0, 0, 50, 20, t);
      return b;
    };
    const uno = pintar(1234);
    const puntos = uno.celdas.filter((c) => c.ch !== " ");
    expect(puntos.length).toBeGreaterThan(80);
    expect(puntos.every((c) => c.ch.charCodeAt(0) >= 0x2800 && c.ch.charCodeAt(0) <= 0x28ff)).toBe(true);
    // En grises: el delfín no tiene color propio.
    expect(puntos.every((c) => c.fg && Math.max(...c.fg) - Math.min(...c.fg) <= 12)).toBe(true);
    expect(diferencia(uno, pintar(1234), "truecolor")).toBe("");
    expect(diferencia(uno, pintar(2600), "truecolor")).not.toBe("");
    // Al abrir se arma: al principio hay menos puntos que un rato después.
    const armando = new Bufer(50, 20);
    pintarDelfin3d(armando, 0, 0, 50, 20, 200, { armadoDesde: 0 });
    expect(armando.celdas.filter((c) => c.ch !== " ").length).toBeLessThan(puntos.length);
  });
});

describe("el estado del equipo", () => {
  it("nombra a cada compañero sin repetir y sigue su progreso", () => {
    const e = equipoInicial("exportar", "mentira", 0);
    aplicarAlEquipo(e, { tipo: "plan", resumen: "en dos", costo: 0, tareas: [{ id: "t1", titulo: "la pantalla" }, { id: "t2", titulo: "el botón" }] }, 1);
    expect(e.tareas.map((x) => x.dueno)).toEqual(["ux", "ux2"]);
    aplicarAlEquipo(e, { tipo: "tarea", id: "t1", estado: "trabajando" }, 2);
    expect(progresoDe(e.tareas[0]!)).toBeGreaterThan(0);
    aplicarAlEquipo(e, { tipo: "companero", id: "t1", evento: { tipo: "escribio", u: "u1", archivos: 2, agregadas: 10, quitadas: 1 } }, 3);
    aplicarAlEquipo(e, { tipo: "tarea", id: "t1", estado: "lista" }, 4);
    aplicarAlEquipo(e, { tipo: "merge", id: "t1", ok: true }, 5);
    expect(e.tareas[0]).toMatchObject({ estado: "integrada", agregadas: 10, archivos: 2 });
    expect(progresoDe(e.tareas[0]!)).toBe(1);
    expect(e.log.map((r) => r.quien)).toContain("ux");
  });
});

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-tui-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module", scripts: { sintaxis: "node --check src/a.js" } }));
  await writeFile(join(repo, "src", "a.js"), "export const suma = (a, b) => a + b\n");
  await git(["init", "-q"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});

afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

const texto = (app: App, ancho = 120, alto = 36) => app.dibujar(ancho, alto).comoTexto().join("\n");
async function teclear(app: App, crudo: string): Promise<void> {
  for (const e of leerEntrada(crudo)) await app.manejar(e);
}

describe("la app de terminal", () => {
  it("abre en el inicio, se mueve por las secciones con números, Ctrl+K y el mouse", async () => {
    const app = new App(new Sesion({ repo, agente: "mentira", automatico: false }));
    expect(texto(app)).toContain("1 Inicio");
    // Tres secciones y nada más, desde el 09/11/2026: inicio, chat y los agentes.
    expect(texto(app)).toContain("3 Equipo");
    expect(texto(app)).not.toContain("Memoria");
    await teclear(app, "3");
    expect(app.vista).toBe("equipo");
    // Ctrl+K, filtro «chat», enter.
    await teclear(app, "\x0bchat\r");
    expect(app.vista).toBe("chat");
    expect(app.paleta).toBeNull();
    // Un clic en la pestaña «2 Chat».
    const pestanas = app.dibujar(120, 36).comoTexto()[1]!;
    await teclear(app, `\x1b[<0;${pestanas.indexOf("2 Chat") + 2};2M`);
    expect(app.vista).toBe("chat");
    // En una terminal chiquita lo dice en vez de romperse.
    expect(texto(app, 50, 15)).toContain("Agrandá la terminal");
  });

  it("anota reglas e ideas en los mismos archivos que la app de escritorio", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false });
    const app = new App(sesion);
    await teclear(app, "/memoria nunca usar any sin comentario\r");
    await teclear(app, "/idea exportar a CSV\r");
    expect((await leerMemoria(repo)).recuerdos.map((r) => r.dicho)).toEqual(["nunca usar any sin comentario"]);
    expect((await leerBandeja(repo)).asuntos.map((a) => a.titulo)).toEqual(["exportar a CSV"]);
    app.datos = await leerInstantanea(repo);
    // La regla y la idea se escriben igual; lo que se fue es la SECCIÓN que las listaba en
    // la terminal, que es la que la app de escritorio muestra mejor. Por eso esto se afirma
    // sobre los datos del proyecto y ya no sobre una pantalla que no existe.
    expect(app.datos.recuerdos.map((r) => r.dicho)).toContain("nunca usar any sin comentario");
  });

  it("una tarea chica la hace un agente solo, en la pestaña Equipo: no hay siembra", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false, verificar: ["sintaxis"] });
    const app = new App(sesion);
    expect(texto(app)).not.toContain("Siembra");
    // Sin permisos automáticos igual arranca: una sola tarea no tiene plan que aprobar.
    await sesion.pedirAlEquipo("sumar una función resta", { solo: true });
    expect(sesion.esperaDale).toBe(false);
    expect(sesion.equipo?.tareas.map((x) => x.titulo)).toEqual(["sumar una función resta"]);
    app.irA("chat");
    const chat = texto(app, 140, 40);
    expect(chat).toContain("Esto lo hace un agente en su rama");
    expect(chat).toMatch(/pasó el portón; está en/);
    await teclear(app, "/sembrar 2 algo\r");
    expect(sesion.mensajes.at(-1)?.texto).not.toMatch(/Siembro/);
  }, 120_000);

  it("/equipo lo hace el equipo, y se ve en el chat y en la pestaña Equipo", async () => {
    const app = new App(new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] }));
    await teclear(app, "/equipo exportar a CSV\r");
    expect(app.vista).toBe("chat");
    const chat = texto(app);
    expect(chat).toContain("exportar a CSV");
    expect(chat).toMatch(/Listo en .* s\. La rama dolphin-equipo\//);
    await teclear(app, "3");
    const equipo = texto(app, 140, 40);
    // Un cuadradito por agente: el líder, los tres compañeros y el revisor.
    expect(equipo).toContain("3 compañeros");
    for (const nombre of ["líder", "backend", "ux", "tests", "revisor"]) expect(equipo).toContain(nombre);
    expect(equipo).toContain("✓ dolphin-equipo/");
    // Enter sobre un compañero abre su terminal: lo que fue haciendo, con el portón al final.
    await teclear(app, "\x1b[C\r");
    const terminal = texto(app, 140, 60);
    expect(terminal).toContain("terminal · backend");
    // Como Claude Code: la herramienta con su argumento, lo que devolvió colgando y el diff abajo.
    expect(terminal).toContain("Read(package.json)");
    expect(terminal).toContain("⎿  Leyó 1 renglón");
    expect(terminal).toMatch(/Write\(dolphin-.*\.txt\)/);
    expect(terminal).toContain("3 agregados, 0 quitados");
    expect(terminal).toContain("☒ Leer el repo");
    expect(terminal).toContain("Portón · sintaxis: pasó");
    // La del líder cuenta cómo partió la tarea.
    await teclear(app, "\x1b");
    await teclear(app, "\x1b[D\r");
    expect(texto(app, 140, 40)).toContain("La parto en tres");
    await teclear(app, "\x1b");
    expect(app.terminalAbierta).toBeNull();
    // Sin permisos se ve arriba; el portón y la revisión siguen.
    expect(equipo).toContain("sin permisos");
  }, 120_000);

  it("abre en cualquier carpeta: sin repo muestra tus proyectos y no deja trabajar hasta elegir uno", async () => {
    const hogar = await mkdtemp(join(tmpdir(), "dolphin-hogar-"));
    const suelta = await mkdtemp(join(tmpdir(), "dolphin-suelta-"));
    const otro = await mkdtemp(join(tmpdir(), "dolphin-otro-"));
    const antes = process.env.DOLPHIN_HOME;
    process.env.DOLPHIN_HOME = hogar;
    try {
      await sumarProyecto(repo, hogar);
      const app = new App(new Sesion({ repo: suelta, agente: "mentira", automatico: false, sinRepo: true }));
      app.datos = await leerInstantanea(suelta);
      const inicio = texto(app);
      expect(inicio).toContain("sin proyecto");
      expect(inicio).toContain("elegí un proyecto");
      // Pedir trabajo sin proyecto no lanza nada: propone una carpeta nueva (o elegir uno).
      await teclear(app, "exportar a CSV\r");
      expect(app.sesion.mensajes.at(-1)?.texto).toContain("necesito un proyecto");
      await teclear(app, "no\r");
      expect(app.sesion.ocupada).toBe(false);
      // Con el prompt vacío, enter en el inicio abre el proyecto elegido de la lista.
      await teclear(app, "1\r");
      expect(app.sesion.config).toMatchObject({ repo, sinRepo: false });
      // /abrir suma uno nuevo a ~/.dolphin (lo ve también la app de escritorio).
      await git(["init", "-q"], otro);
      await git(["-c", "user.email=n@e.com", "-c", "user.name=N", "commit", "--allow-empty", "-qm", "base"], otro);
      await teclear(app, `/abrir ${otro}\r`);
      expect(app.sesion.config.repo).toBe(otro);
      expect((await leerProyectos(hogar)).map((x) => x.ruta)).toContain(otro);
    } finally {
      if (antes === undefined) delete process.env.DOLPHIN_HOME;
      else process.env.DOLPHIN_HOME = antes;
      for (const d of [hogar, suelta, otro]) await borrarCarpeta(d);
    }
  });

  it("Ctrl+C borra el prompt y, con el prompt vacío y nada corriendo, sale", async () => {
    const app = new App(new Sesion({ repo, agente: "mentira", automatico: false }));
    await teclear(app, "algo a medio escribir");
    await teclear(app, "\x03");
    expect(app.prompt.texto).toBe("");
    expect(app.saliendo).toBeNull();
    await teclear(app, "\x03");
    expect(app.saliendo).toBe("salir");
  });
});
