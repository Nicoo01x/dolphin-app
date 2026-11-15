import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { armarInforme, fasesDe, leerTipo } from "../src/nucleo/rendimiento.js";
import { crearServidor } from "../src/servidor.js";
import type { Cosecha, Pasada } from "../src/nucleo/tipos.js";

/**
 * El informe del tablero: lo que el router consulta, puesto a la vista.
 * Por modelo y tipo de tarea, por fase del portón, y la decisión.
 */

const pasada = (verificador: string, paso: boolean, extra: Partial<Pasada> = {}): Pasada => ({
  verificador,
  costo: verificador === "revisión" ? "barato" : "gratis",
  paso,
  detalle: "",
  gastado: verificador === "revisión" ? 0.01 : 0,
  ms: verificador === "revisión" ? 10_000 : 500,
  ...extra,
});

const cosecha = (tarea: string, pasadasPorRama: Pasada[][]): Cosecha => ({
  tarea,
  candidatos: pasadasPorRama.map((pasadas, i) => ({
    universo: { id: `u${i + 1}`, rama: `dolphin/x/u${i + 1}`, ruta: "", nacido: 0 },
    vivo: pasadas.every((p) => p.paso),
    pasadas,
  })),
  gastado: 0,
  muertosGratis: 0,
  ms: 0,
});

describe("el portón, fase por fase", () => {
  it("cuenta corridas (con las vueltas de corrección), pasadas y costo, en el orden en que corren", () => {
    const fases = fasesDe([
      cosecha("Arreglá la suma", [
        [pasada("test", false), pasada("test", true, { intento: 2 }), pasada("revisión", true, { intento: 2 })],
        [pasada("test", true), pasada("revisión", false)],
      ]),
      cosecha("Sumá un botón de exportar", [[pasada("test", true), pasada("pantalla", true), pasada("revisión", true)]]),
    ]);
    expect(fases.map((f) => [f.fase, f.costo, f.corridas, f.pasaron, f.gastado])).toEqual([
      ["test", "gratis", 4, 3, 0],
      ["pantalla", "gratis", 1, 1, 0],
      ["revisión", "barato", 3, 2, 0.03],
    ]);
  });

  it("filtrado por tipo de tarea, mira solo las cosechas de ese tipo", () => {
    const fases = fasesDe(
      [
        cosecha("Arreglá la suma", [[pasada("test", false)]]),
        cosecha("Sumá un botón de exportar", [[pasada("pantalla", true)]]),
      ],
      "pantalla",
    );
    expect(fases.map((f) => f.fase)).toEqual(["pantalla"]);
  });
});

describe("lo que llega por la URL", () => {
  it("un tipo que existe, «todos», o nada; ni «toString» ni inventos", () => {
    expect(leerTipo("arreglo")).toBe("arreglo");
    expect(leerTipo("todos")).toBe("todos");
    expect(leerTipo(null)).toBeUndefined();
    expect(leerTipo("toString")).toBeUndefined();
    expect(leerTipo("cualquiera")).toBeUndefined();
  });
});

describe("el informe de un repo", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-rendimiento-"));
    await mkdir(join(repo, ".dolphin"), { recursive: true });
    const fila = (tipo: string, modelo: string, paso: boolean, costo: number) => ({
      cuando: "2026-10-21T00:00:00.000Z",
      tipo,
      tarea: "x",
      modelo,
      paso,
      vueltas: 1,
      costo,
      ms: 1000,
    });
    const registros = [
      ...Array.from({ length: 6 }, (_, i) => fila("arreglo", "claude-sonnet-5-5", i < 5, 0.1)),
      ...Array.from({ length: 6 }, () => fila("arreglo", "claude-haiku-5-5", true, 0.02)),
      fila("pantalla", "claude-sonnet-5-5", true, 0.2),
    ];
    await writeFile(join(repo, ".dolphin", "desempeno.json"), JSON.stringify({ version: 1, registros }));
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("sin tipo pedido abre en el más medido, con lo que haría el router", async () => {
    const informe = await armarInforme(repo);
    expect(informe.tipos).toEqual([
      { tipo: "arreglo", nombre: "arreglos", ramas: 12 },
      { tipo: "pantalla", nombre: "pantalla", ramas: 1 },
    ]);
    expect(informe.tipo).toBe("arreglo");
    expect(informe.modelos.map((m) => [m.modelo, m.pasaron, m.intentos])).toEqual([
      ["haiku", 6, 6],
      ["sonnet", 5, 6],
    ]);
    // Haiku pasa todas por menos: la estrategia equilibrada lo pone a escribir.
    expect(informe.router).toMatchObject({ estrategia: "equilibrada", escribe: "haiku", fijado: false, faltan: [] });
    expect(informe.router?.porDatos).toContain("escribe haiku en vez de sonnet");
  });

  it("con «todos» no hay decisión: el router decide por tipo de tarea", async () => {
    const informe = await armarInforme(repo, "todos");
    expect(informe.tipo).toBeNull();
    expect(informe.router).toBeUndefined();
    expect(informe.modelos.find((m) => m.modelo === "sonnet")?.intentos).toBe(7);
  });

  it("en un tipo con pocas ramas dice cuántas faltan y que una sale a medir", async () => {
    const informe = await armarInforme(repo, "pantalla");
    expect(informe.router).toMatchObject({ escribe: "sonnet", explorar: "haiku", faltan: [{ modelo: "sonnet", tiene: 1 }, { modelo: "haiku", tiene: 0 }] });
    expect(informe.router?.porDatos).toBeUndefined();
  });

  it("si quién escribe está fijado a mano, lo dice y las cifras no mandan", async () => {
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ modelos: { escribir: "opus" } }));
    const informe = await armarInforme(repo, "arreglo");
    expect(informe.router).toMatchObject({ escribe: "opus", fijado: true });
    expect(informe.router?.porDatos).toBeUndefined();
  });

  it("se sirve en /api/rendimiento", async () => {
    const servidor = crearServidor({ repo, calendario: false });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    try {
      const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      const r = await (await fetch(`${base}/api/rendimiento?tipo=pantalla`)).json();
      expect(r.tipo).toBe("pantalla");
      expect((await (await fetch(`${base}/api/rendimiento?tipo=toString`)).json()).tipo).toBe("arreglo");
    } finally {
      await new Promise((listo) => servidor.close(listo));
    }
  });
});
