import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { correrNoche, pendientesDeLaNoche } from "../src/noche.js";
import { esperar } from "../src/nucleo/tarjetas-espera.js";
import { buscarTarjeta, cambiarTarjeta, crearTarjeta, moverTarjeta } from "../src/nucleo/tarjetas.js";
import type { Cosecha } from "../src/nucleo/tipos.js";

/** La noche toma la columna Para hacer y deja las tarjetas en Para revisar con su rama. */

const cosechaQuePasa = (rama: string): Cosecha =>
  ({
    tarea: "la que sea",
    candidatos: [],
    ganador: { universo: { id: "u1", rama, ruta: "/tmp/u1", nacido: 0 }, vivo: true, pasadas: [] },
    entregada: { rama, commit: "abc123", base: "base123", ramaBase: "main" },
    porQueGano: "pasó el portón",
    gastado: 0.42,
  }) as unknown as Cosecha;

const cosechaQueNoPasa = (): Cosecha =>
  ({ tarea: "la que sea", candidatos: [{ porQue: "los tests fallan" }], gastado: 0.1 }) as unknown as Cosecha;

describe("la noche y el tablero", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-noche-tablero-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  const paraHacer = async (titulo: string, cambio?: (id: string) => Promise<unknown>) => {
    const t = await crearTarjeta(repo, { titulo });
    await moverTarjeta(repo, t.id, "para-hacer");
    if (cambio) await cambio(t.id);
    return t.id;
  };

  it("toma las de Para hacer que puede arrancar el equipo, y deja afuera las frenadas y las que tienen dueño", async () => {
    const primera = await paraHacer("exportar a CSV");
    const conDuenio = await paraHacer("la hago yo", (id) => cambiarTarjeta(repo, id, (t) => ({ ...t, quien: "nico" })));
    const frenada = await paraHacer("depende de la primera");
    await esperar(repo, frenada, primera);
    // Una idea no se toma: todavía no es trabajo.
    const idea = await crearTarjeta(repo, { titulo: "una idea suelta", tipo: "idea" });

    const pendientes = await pendientesDeLaNoche(repo);
    expect(pendientes.map((p) => p.tarjeta)).toEqual([primera]);
    expect(pendientes[0]!.tarea).toContain("exportar a CSV");
    expect(pendientes.some((p) => p.tarjeta === conDuenio || p.tarjeta === frenada || p.tarjeta === idea.id)).toBe(false);
  });

  it("lo suelto y lo de la bandeja van primero; las tarjetas, después", async () => {
    await paraHacer("la del tablero");
    const pendientes = await pendientesDeLaNoche(repo, ["algo suelto"]);
    expect(pendientes.map((p) => p.titulo)).toEqual(["algo suelto", "la del tablero"]);
  });

  it("la que sale queda en Para revisar con su rama y su comentario", async () => {
    const id = await paraHacer("exportar a CSV");
    const [pendiente] = await pendientesDeLaNoche(repo);

    await correrNoche(
      { repo, agente: "mentira", hasta: new Date(Date.now() + 60_000), pendientes: [pendiente!] },
      { sembrar: async () => cosechaQuePasa("dolphin/exportar") },
    );

    const t = await buscarTarjeta(repo, id);
    expect(t.columna).toBe("para-revisar");
    expect(t.rama).toBe("dolphin/exportar");
    expect(t.quien).toBe("agentes");
    expect(t.comentarios.at(-1)!.texto).toBe("La noche la dejó lista · US$ 0.42: pasó el portón. Rama: dolphin/exportar.");
    expect(t.historial.at(-1)!.columna).toBe("para-revisar");
  });

  it("la que no sale vuelve a Para hacer con el porqué, y no queda trabada", async () => {
    const id = await paraHacer("exportar a CSV");
    const [pendiente] = await pendientesDeLaNoche(repo);

    await correrNoche(
      { repo, agente: "mentira", hasta: new Date(Date.now() + 60_000), pendientes: [pendiente!] },
      { sembrar: async () => cosechaQueNoPasa() },
    );

    const t = await buscarTarjeta(repo, id);
    expect(t.columna).toBe("para-hacer");
    expect(t.rama).toBeUndefined();
    expect(t.comentarios.at(-1)!.texto).toContain("La noche no pudo");
    expect(t.comentarios.at(-1)!.texto).toContain("los tests fallan");
  });

  it("una tarea que no es de una tarjeta no toca el tablero", async () => {
    const id = await paraHacer("ni la miran");
    await correrNoche(
      {
        repo,
        agente: "mentira",
        hasta: new Date(Date.now() + 60_000),
        pendientes: [{ id: "s1", titulo: "algo suelto", tarea: "algo suelto" }],
      },
      { sembrar: async () => cosechaQuePasa("dolphin/suelta") },
    );
    expect((await buscarTarjeta(repo, id)).columna).toBe("para-hacer");
  });
});
