import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperar, laEsperan, laFrenan, listasParaHacer, soltar } from "../src/nucleo/tarjetas-espera.js";
import { crearTarjeta, leerTablero, moverTarjeta } from "../src/nucleo/tarjetas.js";
import { crearServidor } from "../src/servidor.js";

let repo = "";
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-espera-"));
});
afterEach(async () => {
  await borrarCarpeta(repo);
});

const reloj = (() => {
  let t = Date.parse("2026-10-29T10:00:00Z");
  return () => new Date((t += 60_000));
})();

describe("tarjetas que esperan a otras", () => {
  it("lo que espera no está listo hasta que lo esperado llega a Hecho", async () => {
    const logica = await crearTarjeta(repo, { titulo: "la exportación" }, reloj());
    const tests = await crearTarjeta(repo, { titulo: "los tests de la exportación" }, reloj());
    const suelta = await crearTarjeta(repo, { titulo: "el logo" }, reloj());
    await esperar(repo, tests.id.slice(0, 12), logica.id.slice(0, 12));

    let tablero = await leerTablero(repo);
    expect(laFrenan(tablero.find((t) => t.id === tests.id)!, tablero).map((t) => t.titulo)).toEqual(["la exportación"]);
    expect(laEsperan(logica, tablero).map((t) => t.titulo)).toEqual(["los tests de la exportación"]);
    expect(listasParaHacer(tablero).map((t) => t.titulo).sort()).toEqual(["el logo", "la exportación"]);

    await moverTarjeta(repo, logica.id, "hecho", reloj());
    tablero = await leerTablero(repo);
    expect(listasParaHacer(tablero).map((t) => t.titulo)).toEqual(["el logo", "los tests de la exportación"]);
    expect(suelta.esperaA).toBeUndefined();
  });

  it("esperar dos veces a la misma no la repite, y soltarla deja la tarjeta como estaba", async () => {
    const a = await crearTarjeta(repo, { titulo: "a" }, reloj());
    const b = await crearTarjeta(repo, { titulo: "b" }, reloj());
    await esperar(repo, b.id, a.id);
    expect((await esperar(repo, b.id, a.id)).esperaA).toEqual([a.id]);
    const suelta = await soltar(repo, b.id, a.id);
    expect(suelta.esperaA).toBeUndefined();
    expect("esperaA" in suelta).toBe(false);
  });

  it("no se espera a sí misma ni arma un círculo, aunque sea de tres", async () => {
    const a = await crearTarjeta(repo, { titulo: "a" }, reloj());
    const b = await crearTarjeta(repo, { titulo: "b" }, reloj());
    const c = await crearTarjeta(repo, { titulo: "c" }, reloj());
    await expect(esperar(repo, a.id, a.id)).rejects.toThrow("a sí misma");
    await esperar(repo, b.id, a.id);
    await esperar(repo, c.id, b.id);
    await expect(esperar(repo, a.id, c.id)).rejects.toThrow("se esperarían para siempre");
  });

  it("una tarjeta que ya no está no frena a nadie, y se puede soltar por su id", async () => {
    const b = await crearTarjeta(repo, { titulo: "b" }, reloj());
    const a = await crearTarjeta(repo, { titulo: "a" }, reloj());
    await esperar(repo, b.id, a.id);
    await rm(join(repo, ".dolphin", "tablero", `${a.id}.json`));
    const tablero = await leerTablero(repo);
    expect(listasParaHacer(tablero).map((t) => t.titulo)).toEqual(["b"]);
    expect((await soltar(repo, b.id, a.id)).esperaA).toBeUndefined();
  });

  it("desde la consola: esperar y soltar, con el pase y con el porqué si no se puede", async () => {
    const a = await crearTarjeta(repo, { titulo: "a" }, reloj());
    const b = await crearTarjeta(repo, { titulo: "b" }, reloj());
    const servidor = crearServidor({ repo, calendario: false });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    try {
      const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      const token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1] ?? "";
      const mandar = (ruta: string, cuerpo: unknown, pase = token) =>
        fetch(`${base}${ruta}`, { method: "POST", headers: { "content-type": "application/json", "x-dolphin-token": pase }, body: JSON.stringify(cuerpo) });
      expect((await mandar(`/api/tablero/${b.id}/esperar`, { otra: a.id }, "")).status).toBe(403);
      expect((await (await mandar(`/api/tablero/${b.id}/esperar`, { otra: a.id })).json()).tarjeta.esperaA).toEqual([a.id]);
      const circulo = await mandar(`/api/tablero/${a.id}/esperar`, { otra: b.id });
      expect(circulo.status).toBe(400);
      expect((await circulo.json()).porQue).toContain("para siempre");
      expect((await (await mandar(`/api/tablero/${b.id}/soltar`, { otra: a.id })).json()).tarjeta.esperaA).toBeUndefined();
    } finally {
      await new Promise((listo) => servidor.close(listo));
    }
  });
});
