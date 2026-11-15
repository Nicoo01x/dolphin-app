import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { HERRAMIENTAS_DEL_TABLERO, esHerramientaDelTablero, llamarHerramientaDelTablero } from "../src/nucleo/tablero-mcp.js";
import { crearTarjeta, leerTablero, moverTarjeta } from "../src/nucleo/tarjetas.js";

/**
 * El tablero por MCP: un asistente puede mirarlo y sumar, y no puede mover, editar ni borrar.
 * Lo que entra por acá cae en Ideas, esperando que una persona lo apruebe.
 */

const llamar = (nombre: string, args: Record<string, unknown>, repo: string) => llamarHerramientaDelTablero(nombre, args, repo);

describe("el tablero por MCP", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-tablero-mcp-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("solo concede mirar y sumar: no hay mover, editar ni borrar", () => {
    const nombres = HERRAMIENTAS_DEL_TABLERO.map((h) => h.name);
    expect(nombres).toEqual(["tablero_listar", "tablero_ver", "tablero_anotar", "tablero_comentar"]);
    for (const prohibida of ["tablero_mover", "tablero_editar", "tablero_borrar", "tablero_tomar"]) {
      expect(esHerramientaDelTablero(prohibida)).toBe(false);
    }
  });

  it("un nombre que no es del tablero se deja pasar, para que el servidor siga probando", async () => {
    expect(await llamar("memoria_listar", {}, repo)).toBeUndefined();
  });

  it("lista lo que hay, filtra por columna y avisa cuando corta", async () => {
    for (let i = 0; i < 3; i++) {
      await crearTarjeta(repo, { titulo: `tarea ${i}`, origen: "vos" });
    }
    const idea = await crearTarjeta(repo, { titulo: "una idea suelta", tipo: "idea" });

    const todas = (await llamar("tablero_listar", {}, repo)) as { tarjetas: { id: string }[]; total: number; hayMas: boolean };
    expect(todas.total).toBe(4);
    expect(todas.hayMas).toBe(false);

    const soloIdeas = (await llamar("tablero_listar", { columna: "ideas" }, repo)) as { tarjetas: { id: string }[]; total: number };
    expect(soloIdeas.total).toBe(1);
    expect(soloIdeas.tarjetas[0]?.id).toBe(idea.id);

    const cortada = (await llamar("tablero_listar", { limite: 2 }, repo)) as { tarjetas: unknown[]; total: number; hayMas: boolean };
    expect(cortada.tarjetas).toHaveLength(2);
    expect(cortada.total).toBe(4);
    expect(cortada.hayMas).toBe(true);
  });

  it("una columna que no existe se dice con las que hay, en vez de devolver vacío", async () => {
    await expect(llamar("tablero_listar", { columna: "en-progreso" }, repo)).rejects.toThrow(/no es una columna/);
  });

  it("lo que anota cae en Ideas con origen mcp, aunque sea un bug", async () => {
    const hecho = (await llamar(
      "tablero_anotar",
      { titulo: "el login no valida el mail", detalle: "Entra cualquier cosa con arroba.", terminado: "un mail sin punto no pasa", tipo: "bug" },
      repo,
    )) as { anotada: boolean; tarjeta: { id: string; columna: string; tipo: string } };

    expect(hecho.anotada).toBe(true);
    expect(hecho.tarjeta.columna).toBe("ideas");
    expect(hecho.tarjeta.tipo).toBe("bug");
    const [guardada] = await leerTablero(repo);
    expect(guardada?.origen).toBe("mcp");
    expect(guardada?.detalle).toBe("Entra cualquier cosa con arroba.");
    expect(guardada?.terminado).toBe("un mail sin punto no pasa");
  });

  it("no anota dos veces lo mismo: dice cuál ya estaba", async () => {
    const primera = await crearTarjeta(repo, { titulo: "el botón de guardar no avisa cuando falla" });
    const respuesta = (await llamar("tablero_anotar", { titulo: "El botón de guardar no avisa cuándo falla" }, repo)) as {
      anotada: boolean;
      yaEstaba: { id: string };
    };
    expect(respuesta.anotada).toBe(false);
    expect(respuesta.yaEstaba.id).toBe(primera.id);
    expect(await leerTablero(repo)).toHaveLength(1);
  });

  it("cuando se parece sin ser la misma, anota igual y avisa de la parecida", async () => {
    await crearTarjeta(repo, { titulo: "exportar los pedidos a CSV" });
    const respuesta = (await llamar("tablero_anotar", { titulo: "exportar los pedidos a PDF con el logo" }, repo)) as {
      anotada: boolean;
      parecidas?: { titulo: string }[];
    };
    expect(respuesta.anotada).toBe(true);
    expect(respuesta.parecidas?.[0]?.titulo).toBe("exportar los pedidos a CSV");
    expect(await leerTablero(repo)).toHaveLength(2);
  });

  it("un título vacío no crea una tarjeta sin nombre", async () => {
    await expect(llamar("tablero_anotar", { titulo: "   " }, repo)).rejects.toThrow(/necesita titulo/);
    expect(await leerTablero(repo)).toHaveLength(0);
  });

  it("comenta una tarjeta y queda firmado como mcp, sin tocar su columna", async () => {
    const tarjeta = await crearTarjeta(repo, { titulo: "migrar la base" });
    await moverTarjeta(repo, tarjeta.id, "haciendo");

    const respuesta = (await llamar("tablero_comentar", { id: tarjeta.id, texto: "  la migración 12 ya no se usa  " }, repo)) as {
      comentada: boolean;
      tarjeta: { columna: string };
      comentario: { quien: string; texto: string };
    };
    expect(respuesta.comentada).toBe(true);
    expect(respuesta.comentario.quien).toBe("mcp");
    expect(respuesta.comentario.texto).toBe("la migración 12 ya no se usa");
    expect(respuesta.tarjeta.columna).toBe("haciendo");

    const [guardada] = await leerTablero(repo);
    expect(guardada?.comentarios).toHaveLength(1);
    expect(guardada?.columna).toBe("haciendo");
  });

  it("acepta el principio del id, como git, y dice cuando no hay esa tarjeta", async () => {
    const tarjeta = await crearTarjeta(repo, { titulo: "una sola" });
    const vista = (await llamar("tablero_ver", { id: tarjeta.id.slice(0, 4) }, repo)) as { tarjeta: { id: string } };
    expect(vista.tarjeta.id).toBe(tarjeta.id);
    await expect(llamar("tablero_ver", { id: "nada" }, repo)).rejects.toThrow(/no hay una tarjeta/);
  });

  it("ver una tarjeta trae sus comentarios y por dónde pasó", async () => {
    const tarjeta = await crearTarjeta(repo, { titulo: "con historia", detalle: "el detalle largo" });
    await moverTarjeta(repo, tarjeta.id, "haciendo");
    await llamar("tablero_comentar", { id: tarjeta.id, texto: "arranqué por los tests" }, repo);

    const vista = (await llamar("tablero_ver", { id: tarjeta.id }, repo)) as {
      tarjeta: { detalle: string; origen: string; comentarios: { texto: string }[]; historial: { columna: string }[] };
    };
    expect(vista.tarjeta.detalle).toBe("el detalle largo");
    expect(vista.tarjeta.comentarios[0]?.texto).toBe("arranqué por los tests");
    expect(vista.tarjeta.historial.map((h) => h.columna)).toEqual(["para-hacer", "haciendo"]);
  });
});
