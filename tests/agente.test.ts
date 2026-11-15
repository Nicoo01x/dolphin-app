import { describe, expect, it } from "vitest";
import { armarPrompt, leerSalida } from "../src/agentes/claude.js";
import { contarDependenciasNuevas, resumenDeCambios } from "../src/nucleo/forma.js";
import { leerCambios } from "../src/nucleo/cambios.js";

describe("leer la salida del CLI", () => {
  it("lee el json normal con su costo", () => {
    const salida = leerSalida('{"result":"listo","is_error":false,"total_cost_usd":0.1842,"num_turns":7}');
    expect(salida.is_error).toBe(false);
    expect(salida.total_cost_usd).toBe(0.1842);
  });

  it("rescata el json aunque el CLI escupa texto suelto antes", () => {
    const salida = leerSalida('aviso: hay una versión nueva\n{"result":"ok","total_cost_usd":0.5}');
    expect(salida.total_cost_usd).toBe(0.5);
  });

  it("una salida vacía es un error, no un éxito silencioso", () => {
    expect(leerSalida("   ").is_error).toBe(true);
  });

  it("texto que no es json se trata como error y se recorta", () => {
    const salida = leerSalida("x".repeat(500));
    expect(salida.is_error).toBe(true);
    expect(salida.result!.length).toBeLessThanOrEqual(200);
  });
});

describe("el prompt", () => {
  it("le prohíbe tocar git: de los commits se encarga dolphin", () => {
    const prompt = armarPrompt("arreglar el desborde");
    expect(prompt).toContain("arreglar el desborde");
    expect(prompt).toMatch(/no hagas commit/i);
  });

  it("deja pegar el contexto de la tarea", () => {
    expect(armarPrompt("x", "tocá solo /facturas")).toContain("tocá solo /facturas");
  });
});

/** Lo que devuelve git con `-z`: los registros separados por NUL. */
const z = (...registros: string[]) => `${registros.join("\0")}\0`;

describe("medir la forma", () => {
  it("suma líneas y cuenta archivos", () => {
    const cambios = leerCambios(z("12\t3\tsrc/a.ts", "4\t0\tsrc/b.ts"), z("M", "src/a.ts", "A", "src/b.ts"));
    expect(resumenDeCambios(cambios)).toMatchObject({ archivos: 2, agregadas: 16, quitadas: 3 });
  });

  it("un binario cuenta como archivo pero no como líneas", () => {
    const cambios = leerCambios(z("-\t-\tlogo.png", "5\t1\tsrc/a.ts"), z("A", "logo.png", "M", "src/a.ts"));
    expect(resumenDeCambios(cambios)).toMatchObject({ archivos: 2, agregadas: 5, quitadas: 1 });
    expect(cambios[0]!.binario).toBe(true);
  });

  it("no cuenta nada cuando no se tocó nada", () => {
    expect(resumenDeCambios(leerCambios("", ""))).toMatchObject({ archivos: 0, agregadas: 0, quitadas: 0 });
  });

  it("una ruta con tilde o ñ llega tal cual, sin los escapes de git", () => {
    // Con -z y core.quotePath=false: antes la política no veía «migrations/001_añadir.sql».
    const cambios = leerCambios(z("3\t0\tmigrations/001_añadir.sql"), z("A", "migrations/001_añadir.sql"));
    expect(cambios.map((c) => c.ruta)).toEqual(["migrations/001_añadir.sql"]);
  });

  it("detecta dependencias agregadas en package.json", () => {
    const diff = [
      "--- a/package.json",
      "+++ b/package.json",
      '+    "lodash": "^4.17.21",',
      '+    "dayjs": "1.11.10"',
      '-    "viejo": "^1.0.0"',
    ].join("\n");
    expect(contarDependenciasNuevas(diff)).toBe(2);
  });

  it("no confunde un script o un nombre con una dependencia", () => {
    const diff = ['+    "name": "mi-app",', '+    "test": "vitest run"'].join("\n");
    expect(contarDependenciasNuevas(diff)).toBe(0);
  });

  it("subirle la versión a una que ya estaba, o al paquete mismo, no es sumar una dependencia", () => {
    const diff = [
      '-    "lodash": "^4.0.0",',
      '+    "lodash": "^4.17.21",',
      '-  "version": "1.2.0",',
      '+  "version": "1.3.0",',
      '+    "node": ">=22.12"',
      '+    "dayjs": "1.11.10"',
    ].join("\n");
    expect(contarDependenciasNuevas(diff)).toBe(1); // dayjs, nada más
  });
});

describe("los archivos tocados que guarda la forma", () => {
  it("lista cada archivo con sus líneas; un renombre es un borrado y un alta", () => {
    const cambios = leerCambios(
      z("9\t2\tsrc/plata.ts", "-\t-\tlogo.png", "0\t4\tsrc/viejo.ts", "4\t0\tsrc/nuevo.ts"),
      z("M", "src/plata.ts", "A", "logo.png", "D", "src/viejo.ts", "A", "src/nuevo.ts"),
    );
    expect(resumenDeCambios(cambios).tocados).toEqual([
      { ruta: "src/plata.ts", agregadas: 9, quitadas: 2 },
      { ruta: "logo.png", agregadas: 0, quitadas: 0 },
      { ruta: "src/viejo.ts", agregadas: 0, quitadas: 4 },
      { ruta: "src/nuevo.ts", agregadas: 4, quitadas: 0 },
    ]);
  });
});

