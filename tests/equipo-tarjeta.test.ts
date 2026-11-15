import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { objetivoDeTarjeta, seguirConTarjeta } from "../src/equipo/con-tarjeta.js";
import type { EventoEquipo } from "../src/equipo/equipo.js";
import { buscarTarjeta, crearTarjeta } from "../src/nucleo/tarjetas.js";

let repo = "";
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-equipo-tarjeta-"));
});
afterEach(async () => {
  await borrarCarpeta(repo);
});

const reloj = () => {
  let t = Date.parse("2026-10-29T10:00:00Z");
  return () => new Date((t += 60_000));
};

const plan: EventoEquipo = { tipo: "plan", resumen: "en dos", costo: 0, tareas: [{ id: "t1", titulo: "la lógica" }, { id: "t2", titulo: "los tests" }] };
const dale: EventoEquipo = { tipo: "etapa", etapa: "spawn" };

describe("el equipo trabajando una tarjeta", () => {
  it("con el «dale» pasa a Haciendo y, si la integración pasa el portón, a Para revisar con su rama", async () => {
    const t = await crearTarjeta(repo, { titulo: "exportar a CSV" });
    const s = seguirConTarjeta(repo, t.id, reloj());
    s.alPasar(plan);
    s.alPasar(dale);
    await s.listo();
    const haciendo = await buscarTarjeta(repo, t.id);
    expect(haciendo).toMatchObject({ columna: "haciendo", quien: "agentes" });
    expect(haciendo.comentarios.at(-1)).toMatchObject({ quien: "dolphin", texto: "El equipo arrancó con 2 tareas." });

    s.alPasar({ tipo: "fin", rama: "dolphin-equipo/abc", ruta: "/x", porQue: "entraron 2 de 2 tareas", ms: 42_000, gastado: 0.5 });
    await s.listo();
    const lista = await buscarTarjeta(repo, t.id);
    expect(lista).toMatchObject({ columna: "para-revisar", rama: "dolphin-equipo/abc" });
    expect(lista.historial.map((h) => h.columna)).toEqual(["para-hacer", "haciendo", "para-revisar"]);
    expect(lista.comentarios.at(-1)?.texto).toBe("Listo en 42 s · US$ 0.50: entraron 2 de 2 tareas. Rama: dolphin-equipo/abc.");
  });

  it("deja escrita en la tarjeta cómo cruzó su rama el portón, fase por fase (vale la última vuelta)", async () => {
    const t = await crearTarjeta(repo, { titulo: "exportar a CSV" });
    const s = seguirConTarjeta(repo, t.id, reloj());
    s.alPasar(plan);
    s.alPasar(dale);
    for (const [verificador, estado] of [
      ["tipos", "corre"],
      ["tipos", "paso"],
      ["test", "fallo"],
      ["lint", "salteada"],
      ["test", "paso"],
    ] as const) {
      s.alPasar({ tipo: "fase-final", verificador, estado });
    }
    s.alPasar({ tipo: "fin", rama: "dolphin-equipo/abc", porQue: "entró", ms: 1_000, gastado: 0 });
    await s.listo();
    expect((await buscarTarjeta(repo, t.id)).porton).toEqual([
      { fase: "tipos", estado: "paso" },
      { fase: "test", estado: "paso" },
      { fase: "lint", estado: "salteada" },
    ]);
  });

  it("si no sale, vuelve a Para hacer con el porqué, y quien la tenía la sigue teniendo", async () => {
    const t = await crearTarjeta(repo, { titulo: "el cupón", quien: "Nico" });
    const s = seguirConTarjeta(repo, t.id, reloj());
    s.alPasar(plan);
    s.alPasar(dale);
    s.alPasar({ tipo: "fin", porQue: "la integración no pasó test", ms: 9_000, gastado: 0 });
    await s.listo();
    const vuelta = await buscarTarjeta(repo, t.id);
    expect(vuelta).toMatchObject({ columna: "para-hacer", quien: "Nico" });
    expect(vuelta.rama).toBeUndefined();
    expect(vuelta.comentarios.map((c) => c.texto)).toEqual(["El equipo arrancó con 2 tareas.", "No salió (9 s): la integración no pasó test"]);
  });

  it("si el plan no arrancó (lo dejaste, se pasaba del tope) no se mueve: solo queda dicho por qué", async () => {
    const t = await crearTarjeta(repo, { titulo: "algo caro" });
    const s = seguirConTarjeta(repo, t.id, reloj());
    s.alPasar(plan);
    s.alPasar({ tipo: "fin", porQue: "el plan se pasa del tope del proyecto", ms: 3_000, gastado: 0.1 });
    await s.listo();
    const igual = await buscarTarjeta(repo, t.id);
    expect(igual.columna).toBe("para-hacer");
    expect(igual.historial).toHaveLength(1);
    expect(igual.comentarios.at(-1)?.texto).toBe("No arrancó: el plan se pasa del tope del proyecto");
  });

  it("una tarjeta que ya no está se avisa al final, sin cortar al equipo", async () => {
    const s = seguirConTarjeta(repo, "t-no-existe");
    expect(() => s.alPasar(dale)).not.toThrow();
    await expect(s.listo()).rejects.toThrow("no hay una tarjeta");
  });

  it("el líder recibe el título, el detalle y cómo se sabe que está terminada; un bug arranca por la prueba", () => {
    expect(objetivoDeTarjeta({ titulo: "exportar a CSV", detalle: "desde la lista de pedidos", terminado: "baja un .csv", tipo: "tarea" })).toBe(
      "exportar a CSV\n\ndesde la lista de pedidos\n\nEstá terminada cuando: baja un .csv",
    );
    const bug = objetivoDeTarjeta({ titulo: "el cupón no descuenta", tipo: "bug" });
    expect(bug.startsWith("Arreglar un bug: el cupón no descuenta")).toBe(true);
    expect(bug).toContain("Primero una prueba que falle");
  });
});
