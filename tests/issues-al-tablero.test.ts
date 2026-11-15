import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { issuesAbiertos, issuesAlTablero } from "../src/nucleo/issues-al-tablero.js";
import { crearTarjeta, leerTablero } from "../src/nucleo/tarjetas.js";

/** Los issues de GitHub entran al tablero como tarjetas, sin gastar un token y sin duplicar. */

const ISSUES = [
  { number: 12, title: "exportar los pedidos a CSV", body: "Lo pidió un cliente.", url: "https://github.com/n/r/issues/12", author: { login: "nico" }, labels: [] },
  { number: 13, title: "el total se rompe con descuento", body: "", url: "https://github.com/n/r/issues/13", author: { login: "otro" }, labels: [{ name: "bug" }] },
];

/** Un `gh` de mentira: ni red, ni sesión, ni CLI instalado. */
const ghDe = (respuesta: unknown) => async () => JSON.stringify(respuesta);

describe("los issues de GitHub al tablero", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-issues-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("los lee con gh y los deja en forma", async () => {
    const leidos = await issuesAbiertos(repo, undefined, ghDe(ISSUES));
    expect(leidos).toHaveLength(2);
    expect(leidos[0]).toMatchObject({ numero: 12, titulo: "exportar los pedidos a CSV", autor: "nico" });
    expect(leidos[1]?.etiquetas).toEqual(["bug"]);
  });

  it("crea una tarjeta por issue, con su número y su link para volver", async () => {
    const r = await issuesAlTablero(repo, { gh: ghDe(ISSUES) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nuevas).toHaveLength(2);
    expect(r.nuevas[0]).toMatchObject({ titulo: "exportar los pedidos a CSV", columna: "ideas", origen: "issue de @nico" });
    expect(r.nuevas[0]?.detalle).toContain("GitHub #12");
    expect(r.nuevas[0]?.detalle).toContain("https://github.com/n/r/issues/12");
  });

  it("lo que suena a algo roto entra como bug", async () => {
    const r = await issuesAlTablero(repo, { gh: ghDe(ISSUES) });
    if (!r.ok) return;
    expect(r.nuevas[1]?.tipo).toBe("bug");
    expect(r.nuevas[0]?.tipo).toBe("tarea");
  });

  it("correrlo de nuevo no duplica, aunque al issue le cambien el título", async () => {
    await issuesAlTablero(repo, { gh: ghDe(ISSUES) });
    const conOtroTitulo = [{ ...ISSUES[0]!, title: "exportar los pedidos a CSV (urgente)" }, ISSUES[1]!];
    const r = await issuesAlTablero(repo, { gh: ghDe(conOtroTitulo) });
    if (!r.ok) return;
    // La huella es el número, no el texto: #12 ya es una tarjeta.
    expect(r.nuevas).toEqual([]);
    expect(r.yaEstaban).toBe(2);
    expect(await leerTablero(repo)).toHaveLength(2);
  });

  it("lo que ya anotaste a mano con otras palabras tampoco entra dos veces", async () => {
    await crearTarjeta(repo, { titulo: "Exportar a CSV los pedidos" });
    const r = await issuesAlTablero(repo, { gh: ghDe([ISSUES[0]]) });
    if (!r.ok) return;
    expect(r.nuevas).toEqual([]);
    expect(r.yaEstaban).toBe(1);
  });

  it("sin la CLI de GitHub lo dice con lo que hay que hacer", async () => {
    const r = await issuesAlTablero(repo, {
      gh: async () => {
        throw new Error("spawn gh ENOENT");
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.porQue).toContain("gh auth login");
  });

  it("un repo sin issues no crea nada", async () => {
    const r = await issuesAlTablero(repo, { gh: ghDe([]) });
    expect(r).toMatchObject({ ok: true, nuevas: [], yaEstaban: 0 });
  });

  it("muchos issues no inundan el tablero", async () => {
    const muchos = Array.from({ length: 40 }, (_, i) => ({ number: 100 + i, title: `pendiente número ${i}`, body: "", url: `https://github.com/n/r/issues/${100 + i}`, author: { login: "n" }, labels: [] }));
    const r = await issuesAlTablero(repo, { gh: ghDe(muchos), tope: 5 });
    if (!r.ok) return;
    expect(r.nuevas).toHaveLength(5);
  });
});
