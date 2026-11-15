import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearServidor } from "../src/servidor.js";

/** El tablero desde la consola: anotar, mover, editar y comentar, siempre con el pase. */

describe("la API del tablero", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-tablero-api-"));
    servidor = crearServidor({ repo, calendario: false });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(repo);
  });

  const pase = async () => /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1];
  const mandar = (ruta: string, cuerpo: unknown, token?: string) =>
    fetch(`${base}${ruta}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-dolphin-token": token } : {}) }, body: JSON.stringify(cuerpo) });

  it("sin tarjetas es una lista vacía, no un error", async () => {
    expect(await (await fetch(`${base}/api/tablero`)).json()).toEqual({ tarjetas: [] });
  });

  it("escribir pide el pase de la consola", async () => {
    expect((await mandar("/api/tablero", { titulo: "x" })).status).toBe(403);
    expect((await (await fetch(`${base}/api/tablero`)).json()).tarjetas).toHaveLength(0);
  });

  it("anota, mueve, edita y comenta", async () => {
    const token = await pase();
    const creada = await mandar("/api/tablero", { titulo: "exportar a CSV", columna: "hacer" }, token);
    expect(creada.status).toBe(201);
    const { tarjeta } = (await creada.json()) as { tarjeta: { id: string; columna: string } };
    expect(tarjeta.columna).toBe("para-hacer");

    const movida = await (await mandar(`/api/tablero/${tarjeta.id}/mover`, { columna: "Para revisar" }, token)).json();
    expect(movida.tarjeta.columna).toBe("para-revisar");
    const editada = await (await mandar(`/api/tablero/${tarjeta.id}/editar`, { terminado: "baja el archivo", quien: "agentes" }, token)).json();
    expect(editada.tarjeta).toMatchObject({ terminado: "baja el archivo", quien: "agentes", titulo: "exportar a CSV" });
    // Un campo vacío lo borra; el título no se puede vaciar.
    expect((await (await mandar(`/api/tablero/${tarjeta.id}/editar`, { quien: "" }, token)).json()).tarjeta.quien).toBeUndefined();
    expect((await mandar(`/api/tablero/${tarjeta.id}/editar`, { titulo: "  " }, token)).status).toBe(400);
    const comentada = await (await mandar(`/api/tablero/${tarjeta.id}/comentar`, { texto: "ojo con las comas" }, token)).json();
    expect(comentada.tarjeta.comentarios).toHaveLength(1);

    const lista = await (await fetch(`${base}/api/tablero`)).json();
    expect(lista.tarjetas).toHaveLength(1);
    expect(lista.tarjetas[0]).toMatchObject({ columna: "para-revisar", terminado: "baja el archivo" });
  });

  it("lo mal pedido se contesta con el porqué", async () => {
    const token = await pase();
    expect((await mandar("/api/tablero", { titulo: "" }, token)).status).toBe(400);
    const { tarjeta } = await (await mandar("/api/tablero", { titulo: "x" }, token)).json();
    const mala = await mandar(`/api/tablero/${tarjeta.id}/mover`, { columna: "a ningún lado" }, token);
    expect(mala.status).toBe(400);
    expect((await mala.json()).porQue).toContain("columna");
    const otra = await mandar("/api/tablero/tnoexiste/mover", { columna: "hecho" }, token);
    expect((await otra.json()).porQue).toContain("no hay una tarjeta");
  });
});
