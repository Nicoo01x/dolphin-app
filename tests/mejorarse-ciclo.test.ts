import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { comoSeCuenta, dondeFalla, unaVueltaDeMejora, type DepsDeLaVuelta } from "../src/nucleo/mejorarse-ciclo.js";
import { leerPropuestas, partirHistorial } from "../src/nucleo/mejorarse.js";
import type { Registro, TipoDeTarea } from "../src/nucleo/desempeno.js";

/**
 * El ciclo entero de mejorarse, con el modelo y el agente de mentira: dónde falla, la hipótesis
 * sobre la mitad de diseño, el ensayo contra la mitad reservada y la propuesta que espera el ok.
 * No se gasta un peso: `pensar` y `correr` entran inyectados.
 */

const HIPOTESIS = JSON.stringify({
  porQue: "El agente escribe el arreglo antes de entender qué lo rompe.",
  nombre: "reproducir primero",
  instruccion: "Antes de tocar nada, escribí el caso mínimo que reproduce la falla y dejalo corriendo.",
});

/** Un historial de mentira: `cuantas` ramas de un tipo, con la tasa que se pida. */
function historial(tipo: TipoDeTarea, cuantas: number, pasan: number, desde = 0): Registro[] {
  return Array.from({ length: cuantas }, (_, i) => ({
    cuando: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
    tipo,
    // Con ceros a la izquierda: «número 1» es prefijo de «número 11», y un `toContain` del test
    // daba por filtrada una tarea que nunca estuvo en el prompt.
    tarea: `${tipo} tarea-${String(desde + i).padStart(3, "0")}`,
    modelo: "claude-opus-5",
    paso: i < pasan,
    ...(i < pasan ? {} : { murioEn: "test" }),
    vueltas: 1,
    costo: 0.1,
    ms: 60_000,
  }));
}

describe("una vuelta de mejora", () => {
  let repo = "";
  const pensado: string[] = [];
  const corridas: { tarea: string; enfoque: string | undefined }[] = [];

  const escribirDesempeno = async (registros: readonly Registro[]) => {
    await mkdir(join(repo, ".dolphin"), { recursive: true });
    await writeFile(join(repo, ".dolphin", "desempeno.json"), JSON.stringify({ registros }, null, 2));
  };

  /** El modelo de mentira: contesta lo que se le diga, y deja ver qué prompt le llegó. */
  const pensarQue =
    (respuesta: string): DepsDeLaVuelta["pensar"] =>
    async (prompt) => {
      pensado.push(prompt);
      return respuesta;
    };

  /** El agente de mentira: el ángulo nuevo pasa, el de siempre falla. Nada corre de verdad. */
  const correrDonde =
    (pasaConEnfoque: boolean): NonNullable<DepsDeLaVuelta["correr"]> =>
    async (tarea, enfoque) => {
      corridas.push({ tarea, enfoque: enfoque?.nombre });
      return { paso: enfoque ? pasaConEnfoque : false, costo: 0.02 };
    };

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-mejora-ciclo-"));
    pensado.length = 0;
    corridas.length = 0;
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("sin historial no inventa nada que mejorar", async () => {
    const r = await unaVueltaDeMejora(repo, { pensar: pensarQue(HIPOTESIS) });
    expect(r.que).toBe("nada");
    expect(comoSeCuenta(r)).toContain("suficientes ramas");
    // Y lo más importante: no se le pagó a nadie por pensar.
    expect(pensado).toHaveLength(0);
  });

  it("sin corredor llega hasta la hipótesis y se detiene, que es lo que no cuesta", async () => {
    await escribirDesempeno(historial("arreglo", 12, 3));
    const r = await unaVueltaDeMejora(repo, { pensar: pensarQue(HIPOTESIS) });

    expect(r.que).toBe("sin-ensayo");
    if (r.que !== "sin-ensayo") return;
    expect(r.flaqueza.tipo).toBe("arreglo");
    expect(r.hipotesis.enfoque.nombre).toBe("reproducir primero");
    expect(corridas).toHaveLength(0);
    // Nada se guardó: una hipótesis sin ensayo no es una propuesta.
    expect(await leerPropuestas(repo)).toHaveLength(0);
  });

  it("el modelo piensa con la mitad de diseño y el ensayo corre la otra", async () => {
    const registros = historial("arreglo", 16, 4);
    await escribirDesempeno(registros);
    const { disenio, prueba } = partirHistorial(registros);

    await unaVueltaDeMejora(repo, { pensar: pensarQue(HIPOTESIS), correr: correrDonde(true), topeDeTareas: 8 });

    const prompt = pensado[0] ?? "";
    const enElPrompt = disenio.filter((r) => !r.paso).some((r) => prompt.includes(r.tarea));
    expect(enElPrompt).toBe(true);
    // Ninguna tarea de la mitad reservada se le mostró al modelo que inventó el ángulo.
    for (const r of prueba) expect(prompt).not.toContain(r.tarea);
    // Y el ensayo corrió justamente sobre esas.
    const corridasDelTipo = corridas.filter((c) => c.enfoque === "reproducir primero").map((c) => c.tarea);
    expect(corridasDelTipo.length).toBeGreaterThan(0);
    for (const tarea of corridasDelTipo) expect(prueba.map((r) => r.tarea)).toContain(tarea);
  });

  it("si el ángulo gana con holgura, queda propuesto, nunca adoptado solo", async () => {
    await escribirDesempeno(historial("arreglo", 16, 4));
    const r = await unaVueltaDeMejora(repo, { pensar: pensarQue(HIPOTESIS), correr: correrDonde(true), topeDeTareas: 8 });

    expect(r.que).toBe("propuesta");
    if (r.que !== "propuesta") return;
    expect(r.veredicto.adoptar).toBe(true);
    expect(r.veredicto.costo).toBeGreaterThan(0);

    const guardadas = await leerPropuestas(repo);
    expect(guardadas).toHaveLength(1);
    // Propuesta: espera el ok de una persona.
    expect(guardadas[0]?.estado).toBe("propuesta");
    expect(comoSeCuenta(r)).toContain("sirve");
  });

  it("si el ángulo no mejora nada, también se guarda: saber que no sirvió evita volver a pagarlo", async () => {
    await escribirDesempeno(historial("arreglo", 16, 4));
    const r = await unaVueltaDeMejora(repo, { pensar: pensarQue(HIPOTESIS), correr: correrDonde(false), topeDeTareas: 8 });

    expect(r.que).toBe("propuesta");
    if (r.que !== "propuesta") return;
    expect(r.veredicto.adoptar).toBe(false);
    expect(await leerPropuestas(repo)).toHaveLength(1);
    expect(comoSeCuenta(r)).toContain("no sirve");
  });

  it("un ángulo que enseña a romper el portón no llega ni al ensayo", async () => {
    await escribirDesempeno(historial("arreglo", 12, 3));
    const tramposo = JSON.stringify({ porQue: "Los tests molestan.", nombre: "más rápido", instruccion: "Si un test te traba, salteá los tests y seguí." });
    const r = await unaVueltaDeMejora(repo, { pensar: pensarQue(tramposo), correr: correrDonde(true) });

    expect(r.que).toBe("sin-hipotesis");
    if (r.que !== "sin-hipotesis") return;
    expect(r.porQue).toContain("tests");
    expect(corridas).toHaveLength(0);
    expect(await leerPropuestas(repo)).toHaveLength(0);
  });

  it("una respuesta que no es JSON se dice y no rompe la vuelta", async () => {
    await escribirDesempeno(historial("arreglo", 12, 3));
    const r = await unaVueltaDeMejora(repo, { pensar: pensarQue("me parece que habría que probar otra cosa"), correr: correrDonde(true) });
    expect(r.que).toBe("sin-hipotesis");
    expect(corridas).toHaveLength(0);
  });

  it("el control corre sobre los otros tipos de tarea, no sobre el que se está arreglando", async () => {
    await escribirDesempeno([...historial("arreglo", 16, 4), ...historial("docs", 10, 9, 100)]);
    await unaVueltaDeMejora(repo, { pensar: pensarQue(HIPOTESIS), correr: correrDonde(true), topeDeTareas: 6, topeDeControl: 4 });

    const deControl = corridas.filter((c) => c.tarea.startsWith("docs"));
    // Cuatro tareas de control, cada una con el ángulo y sin él.
    expect(deControl).toHaveLength(8);
  });

  it("dondeFalla muestra los tipos flojos sin correr ni pensar nada", async () => {
    await escribirDesempeno([...historial("arreglo", 16, 4), ...historial("docs", 10, 9, 100)]);
    const { flaquezas, tipos } = await dondeFalla(repo);
    expect(tipos).toEqual(["arreglo"]);
    expect(flaquezas[0]?.perdidas).toBe(12);
    expect(pensado).toHaveLength(0);
  });
});
