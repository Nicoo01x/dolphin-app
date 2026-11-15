// Sacar la imagen del portapapeles en una terminal. Lo que importa: que «no hay imagen» y «te
// falta la herramienta» se digan DISTINTO, porque lo que hay que hacer en cada caso no se parece
// en nada.

import { describe, expect, it } from "vitest";
import {
  comandoDePegado,
  guionDeWindows,
  leerPegado,
  nombreDeLaImagen,
  SinHerramienta,
  SinImagen,
} from "../src/nucleo/imagen-del-portapapeles.js";

describe("con qué se saca la imagen", () => {
  // Con su .exe a propósito: el comando se lanza SIN shell —con shell los argumentos se
  // concatenan sin escapar y uno de ellos es un guion con una ruta adentro— y sin shell `spawn`
  // necesita el nombre exacto del ejecutable.
  it("en Windows pide hilo STA, sin el cual el portapapeles contesta vacío siempre", () => {
    const c = comandoDePegado("win32", "C:/tmp/a.png");
    expect(c.programa).toBe("powershell.exe");
    expect(c.argumentos).toContain("-STA");
    expect(c.porSalida).toBe(false);
  });

  it("una ruta con comilla no rompe el guion de PowerShell", () => {
    expect(guionDeWindows("C:/tmp/el 'repo'/a.png")).toContain("'C:/tmp/el ''repo''/a.png'");
  });

  it("en macOS y en Linux dice qué instalar si falta", () => {
    expect(comandoDePegado("darwin", "/tmp/a.png").seInstala).toContain("pngpaste");
    expect(comandoDePegado("linux", "/tmp/a.png").seInstala).toContain("wl-clipboard");
  });

  it("en Linux la imagen sale por la salida, no la escribe el programa", () => {
    expect(comandoDePegado("linux", "/tmp/a.png").porSalida).toBe(true);
  });
});

describe("cómo se lee lo que salió", () => {
  const win = comandoDePegado("win32", "/tmp/a.png");
  const linux = comandoDePegado("linux", "/tmp/a.png");

  it("con imagen, devuelve la ruta", () => {
    expect(leerPegado(win, { codigo: 0, texto: "ok", bytes: 0 }, "/tmp/a.png")).toBe("/tmp/a.png");
    expect(leerPegado(linux, { codigo: 0, texto: "", bytes: 1234 }, "/tmp/a.png")).toBe("/tmp/a.png");
  });

  it("el portapapeles vacío NO es un error del sistema: se dice que no hay imagen", () => {
    expect(() => leerPegado(win, { codigo: 0, texto: "nada", bytes: 0 }, "/tmp/a.png")).toThrow(SinImagen);
    expect(() => leerPegado(linux, { codigo: 1, texto: "", bytes: 0 }, "/tmp/a.png")).toThrow(SinImagen);
  });

  it("una salida de cero bytes no deja un png vacío pasando por imagen", () => {
    expect(() => leerPegado(linux, { codigo: 0, texto: "", bytes: 0 }, "/tmp/a.png")).toThrow(SinImagen);
  });

  it("si falta la herramienta, lo dice con el comando para instalarla", () => {
    expect(() => leerPegado(linux, { codigo: null, texto: "", bytes: 0 }, "/tmp/a.png")).toThrow(
      /wl-clipboard/,
    );
    expect(() => leerPegado(linux, { codigo: null, texto: "", bytes: 0 }, "/tmp/a.png")).toThrow(
      SinHerramienta,
    );
  });

  it("y si la herramienta falló por otra cosa, eso tampoco es «no hay imagen»", () => {
    expect(() =>
      leerPegado(win, { codigo: 1, texto: "Access denied\nmás ruido", bytes: 0 }, "/tmp/a.png"),
    ).toThrow(/Access denied/);
  });
});

describe("el nombre del archivo", () => {
  it("lleva la hora, así dos pegadas seguidas no se pisan", () => {
    expect(nombreDeLaImagen(new Date(2026, 10, 9, 5, 7, 3))).toBe("pegada-20261109-050703.png");
  });
});
