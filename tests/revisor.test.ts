import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { leerVeredicto, promptDeRevision, verificadorRevisor, type CorrerRevisor } from "../src/agentes/revisor.js";
import type { Universo } from "../src/nucleo/tipos.js";

/**
 * El revisor independiente, con el modelo inyectado: lo que se le pregunta,
 * cómo se lee lo que contesta, y que un revisor que falla no corte a nadie.
 */

const correr = promisify(execFile);

describe("la revisión independiente", () => {
  let repo = "";
  let universo: Universo;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-revisor-"));
    await writeFile(join(repo, "plata.js"), "export const conIva = (neto) => neto * 1.21;\n");
    for (const args of [["init", "-q"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    // El cambio de la rama: lo que el revisor tiene que leer.
    await writeFile(join(repo, "plata.js"), "export const conIva = (neto) => Math.round(neto * 1.21 * 100) / 100;\n");
    universo = { id: "u1", rama: "dolphin/u1", ruta: repo, nacido: 0 };
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  const contesta = (texto: string, gastado = 0.002): { correr: CorrerRevisor; pedidos: { prompt: string; modelo: string }[] } => {
    const pedidos: { prompt: string; modelo: string }[] = [];
    return {
      pedidos,
      correr: async (prompt, _u, modelo) => {
        pedidos.push({ prompt, modelo });
        return { texto, gastado };
      },
    };
  };

  it("le pasa al modelo barato la tarea y el diff, y acepta lo que cumple", async () => {
    const modelo = contesta('{"paso": true, "porque": "redondea a centavos una sola vez, como pide la tarea"}');
    const revisor = verificadorRevisor({ tarea: "redondeá el IVA a centavos", modelo: "haiku", correr: modelo.correr });

    const v = await revisor.correr(universo);
    expect(revisor.costo).toBe("barato");
    expect(v).toMatchObject({ paso: true, detalle: "revisión: redondea a centavos una sola vez, como pide la tarea", gastado: 0.002 });
    expect(modelo.pedidos[0]!.modelo).toBe("haiku");
    expect(modelo.pedidos[0]!.prompt).toContain("«redondeá el IVA a centavos»");
    expect(modelo.pedidos[0]!.prompt).toContain("+export const conIva = (neto) => Math.round(neto * 1.21 * 100) / 100;");
  });

  it("corta lo que no cumple, con la oración del revisor como motivo", async () => {
    const modelo = contesta('Revisé el cambio.\n{"paso": false, "porque": "cambia el redondeo de toda la app, no solo el del IVA"}');
    const v = await verificadorRevisor({ tarea: "x", modelo: "haiku", correr: modelo.correr }).correr(universo);
    expect(v.paso).toBe(false);
    expect(v.detalle).toBe("revisión: cambia el redondeo de toda la app, no solo el del IVA");
    expect(v.evidencia).toContain("Revisó haiku.");
  });

  it("si esta rama la escribió el mismo modelo que revisa (la que sale a medir), revisa el de al lado", async () => {
    const modelo = contesta('{"paso": true, "porque": "bien"}');
    const revisor = verificadorRevisor({ tarea: "x", modelo: "haiku", correr: modelo.correr });
    const v = await revisor.correr(universo, { modelo: "claude-haiku-5-5" });
    expect(modelo.pedidos[0]!.modelo).toBe("sonnet");
    expect(v.evidencia).toContain("Revisó sonnet.");
    // Si la escribió otro, revisa el de siempre.
    await revisor.correr(universo, { modelo: "claude-sonnet-5-5" });
    expect(modelo.pedidos[1]!.modelo).toBe("haiku");
  });

  it("si contesta cualquier cosa, se le pide una vez más; si tampoco, no corta a nadie pero queda salteada", async () => {
    const modelo = contesta("Me parece bien, salvo detalles.", 0.002);
    const v = await verificadorRevisor({ tarea: "x", modelo: "haiku", correr: modelo.correr }).correr(universo);
    // El problema es del revisor, no del código: no corta. Pero tampoco cuenta como revisada.
    expect(v).toMatchObject({ paso: true, salteada: true, gastado: 0.004 });
    expect(v.detalle).toContain("no contestó en el formato pedido ni a la segunda");
    expect(modelo.pedidos).toHaveLength(2);
    expect(modelo.pedidos[1]!.prompt).toContain("tu respuesta anterior no trajo el JSON");
  });

  it("si a la segunda contesta bien, vale ese veredicto y se pagan las dos", async () => {
    const respuestas = ["Lo miré y está bien.", '{"decision": "cortar", "porque": "no redondea"}'];
    let vuelta = 0;
    const correrRevisor: CorrerRevisor = async () => ({ texto: respuestas[vuelta++]!, gastado: 0.003 });
    const v = await verificadorRevisor({ tarea: "x", modelo: "haiku", correr: correrRevisor }).correr(universo);
    expect(v).toMatchObject({ paso: false, detalle: "revisión: no redondea", gastado: 0.006 });
    expect(v).not.toHaveProperty("salteada");
  });

  it("sin cambios no hay nada que pagar, ni que aprobar: una corrección que deshizo todo no gana", async () => {
    await correr("git", ["checkout", "--", "."], { cwd: repo, windowsHide: true });
    const modelo = contesta('{"paso": true, "porque": "x"}');
    const v = await verificadorRevisor({ tarea: "x", modelo: "haiku", correr: modelo.correr }).correr(universo);
    expect(v).toMatchObject({ paso: false, gastado: 0 });
    expect(v.detalle).toContain("no dejó ningún cambio");
    expect(modelo.pedidos).toHaveLength(0);
  });

  it("pide una palabra con el verbo de la consigna, «aceptar» o «cortar», y la lee", () => {
    const prompt = promptDeRevision("x", "+a");
    expect(prompt).toContain('"aceptar" si hace lo que pide la tarea');
    expect(prompt).toContain('{"decision": "aceptar o cortar", "porque":');
    expect(prompt).not.toContain('"paso"');
    expect(leerVeredicto('{"decision": "aceptar", "porque": "da 180"}')).toEqual({ paso: true, porque: "da 180" });
    expect(leerVeredicto('{"decision": "Cortar", "porque": "da 190"}')).toEqual({ paso: false, porque: "da 190" });
    // Lo que no es una de las dos palabras no es un veredicto: ni el ejemplo copiado ni un «depende».
    expect(leerVeredicto('{"decision": "aceptar o cortar", "porque": "x"}')).toBeUndefined();
    expect(leerVeredicto('{"decision": "depende", "porque": "x"}')).toBeUndefined();
  });

  it("lee el último veredicto aunque venga en un bloque de código o con texto alrededor", () => {
    expect(leerVeredicto('```json\n{"paso": true, "porque": "bien"}\n```')).toEqual({ paso: true, porque: "bien" });
    expect(leerVeredicto('primero {"paso": true} y al final {"paso": false, "porque": "rompe el alta"}')).toEqual({
      paso: false,
      porque: "rompe el alta",
    });
    expect(leerVeredicto('{"paso": "sí"}')).toBeUndefined();
    expect(leerVeredicto("sin json")).toBeUndefined();
  });

  it("un diff enorme se recorta y lo dice", () => {
    const diff = Array.from({ length: 900 }, (_, i) => `+linea ${i}`).join("\n");
    const prompt = promptDeRevision("x", diff);
    expect(prompt).toContain("+linea 599");
    expect(prompt).not.toContain("+linea 600");
    expect(prompt).toContain("se muestran las primeras 600 líneas");
  });
});
