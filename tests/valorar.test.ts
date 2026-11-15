import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { leerBandeja, sumarAsuntos } from "../src/nucleo/bandeja.js";
import { guardarPerfil } from "../src/nucleo/perfil.js";
import { leerValoraciones, promptDeValorar, valorarIdeas, type Valorador } from "../src/nucleo/valorar.js";
import { crearServidor } from "../src/servidor.js";

/**
 * Valorar las ideas: el juez las compara entre sí para ESTE proyecto, y la
 * bandeja guarda cuánto vale cada una, cuánto cuesta y por qué.
 */

let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-valorar-"));
});

afterEach(async () => {
  await borrarCarpeta(repo);
});

async function tresIdeas() {
  const { sumados } = await sumarAsuntos(repo, [
    { tipo: "idea", titulo: "Exportar a CSV", detalle: "Bajar el listado en CSV.", origen: "scout" },
    { tipo: "idea", titulo: "Modo oscuro", detalle: "Un tema oscuro.", origen: "scout" },
    { tipo: "error", titulo: "Guardar no anda", detalle: "Tocás Guardar y no pasa nada.", origen: "explorador" },
  ]);
  return sumados;
}

describe("valorar las ideas", () => {
  it("el juez recibe lo que el proyecto sabe de sí y solo las ideas abiertas", async () => {
    await tresIdeas();
    await guardarPerfil(repo, "- Es una app de facturación para contadores.");
    const ideas = (await leerBandeja(repo)).asuntos.filter((a) => a.tipo === "idea");
    const prompt = await promptDeValorar(repo, ideas);
    expect(prompt).toContain("app de facturación para contadores");
    expect(prompt).toContain("Exportar a CSV");
    expect(prompt).not.toContain("Guardar no anda");
    // Lo que escribe lo lee la persona: con el vocabulario de Dolphin, no el de adentro del código.
    expect(prompt).toContain("nunca universo ni universos");
  });

  it("anota valor, esfuerzo y porqué en cada idea, e ignora lo que el juez inventa", async () => {
    const [csv, oscuro] = await tresIdeas();
    let preguntado = "";
    const juez: Valorador = async (prompt) => {
      preguntado = prompt;
      return {
        texto: JSON.stringify({
          ideas: [
            { id: csv!.id, valor: 5, esfuerzo: 1, porQue: "Los contadores viven exportando." },
            { id: oscuro!.id, valor: 9, esfuerzo: 0, porQue: "Lindo pero no urgente." },
            { id: "no-existe", valor: 5, esfuerzo: 1, porQue: "inventada" },
          ],
        }),
        gastado: 0.03,
      };
    };
    const hecho = await valorarIdeas(repo, juez, new Date("2026-10-22T12:00:00Z"));
    expect(preguntado).toContain(csv!.id);
    expect(hecho).toEqual({ valoradas: 2, gastado: 0.03 });
    const asuntos = (await leerBandeja(repo)).asuntos;
    expect(asuntos.find((a) => a.id === csv!.id)?.valoracion).toEqual({
      valor: 5,
      esfuerzo: 1,
      porQue: "Los contadores viven exportando.",
      cuando: "2026-10-22T12:00:00.000Z",
    });
    // Fuera de rango se acota: el 9 es un 5 y el 0 un 1.
    expect(asuntos.find((a) => a.id === oscuro!.id)?.valoracion).toMatchObject({ valor: 5, esfuerzo: 1 });
    // El error no se valora: se arregla.
    expect(asuntos.find((a) => a.tipo === "error")?.valoracion).toBeUndefined();
  });

  it("sin ideas abiertas no llama al juez", async () => {
    let llamado = false;
    const hecho = await valorarIdeas(repo, async () => ((llamado = true), { texto: "{}", gastado: 0 }));
    expect(llamado).toBe(false);
    expect(hecho).toEqual({ valoradas: 0, gastado: 0 });
  });

  it("una respuesta sin JSON es un error con su porqué", () => {
    expect(() => leerValoraciones("no sé", new Set())).toThrow("no contestó un JSON");
  });
});

describe("valorar desde la consola", () => {
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
  });

  it("valorar compara todas las ideas abiertas de una vez", async () => {
    const [csv] = await tresIdeas();
    servidor = crearServidor({
      repo,
      calendario: false,
      valorador: async () => ({ texto: JSON.stringify({ ideas: [{ id: csv!.id, valor: 4, esfuerzo: 2, porQue: "Suma." }] }), gastado: 0 }),
    });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
    const pagina = await (await fetch(`${base}/`)).text();
    const token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(pagina)?.[1] ?? "";
    const r = await fetch(`${base}/api/bandeja`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dolphin-token": token },
      body: JSON.stringify({ accion: "valorar" }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, valoradas: 1 });
    const { asuntos } = (await (await fetch(`${base}/api/bandeja`)).json()) as { asuntos: { id: string; valoracion?: { valor: number } }[] };
    expect(asuntos.find((a) => a.id === csv!.id)?.valoracion?.valor).toBe(4);
  });
});
