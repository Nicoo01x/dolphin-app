import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { buscarTarjeta, cambiarTarjeta, crearTarjeta, moverTarjeta } from "../src/nucleo/tarjetas.js";
import { destrabarTarjetas, laTrabajaAlguien, latirTarjeta, LATIDO_MS, dejarDeLatir } from "../src/nucleo/tarjetas-trabadas.js";
import { crearServidor } from "../src/servidor.js";

/** Una tarjeta en Haciendo cuyo proceso murió no queda trabada para siempre. */

describe("las tarjetas trabadas", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-trabadas-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  /** Una que el equipo dejó en Haciendo. */
  const haciendo = async (titulo = "exportar a CSV") => {
    const t = await crearTarjeta(repo, { titulo });
    await cambiarTarjeta(repo, t.id, (x) => ({ ...x, quien: "agentes" }));
    await moverTarjeta(repo, t.id, "haciendo");
    return t.id;
  };

  it("sin latido, la saca de Haciendo y deja la constancia", async () => {
    const id = await haciendo();
    const [destrabada] = await destrabarTarjetas(repo);
    expect(destrabada?.id).toBe(id);
    const t = await buscarTarjeta(repo, id);
    expect(t.columna).toBe("para-hacer");
    expect(t.comentarios.at(-1)!.texto).toContain("se cortó antes de terminar");
    expect(t.historial.at(-1)!.columna).toBe("para-hacer");
  });

  it("con un latido reciente de un proceso vivo, no la toca", async () => {
    const id = await haciendo();
    await latirTarjeta(repo, id, 1234);
    expect(await destrabarTarjetas(repo, () => true)).toEqual([]);
    expect((await buscarTarjeta(repo, id)).columna).toBe("haciendo");
  });

  it("si el proceso murió, no alcanza con que el latido sea de hace un rato", async () => {
    const id = await haciendo();
    await latirTarjeta(repo, id, 1234);
    // En Windows un pid muerto se le da enseguida a otro programa: se piden las dos cosas.
    expect((await destrabarTarjetas(repo, () => false)).map((t) => t.id)).toEqual([id]);
  });

  it("un latido viejo no la sostiene aunque el pid siga vivo", async () => {
    const id = await haciendo();
    await latirTarjeta(repo, id, 1234, Date.now() - 4 * LATIDO_MS);
    expect((await destrabarTarjetas(repo, () => true)).map((t) => t.id)).toEqual([id]);
  });

  it("una que tomaste vos no se toca: es tuya aunque esté a medias", async () => {
    const t = await crearTarjeta(repo, { titulo: "la hago yo" });
    await cambiarTarjeta(repo, t.id, (x) => ({ ...x, quien: "nico" }));
    await moverTarjeta(repo, t.id, "haciendo");
    expect(await destrabarTarjetas(repo)).toEqual([]);
    expect((await buscarTarjeta(repo, t.id)).columna).toBe("haciendo");
  });

  it("al dejar de latir, deja de sostenerla", async () => {
    const id = await haciendo();
    await latirTarjeta(repo, id, 1234);
    expect(await laTrabajaAlguien(repo, await buscarTarjeta(repo, id), () => true)).toBe(true);
    await dejarDeLatir(repo, id);
    expect(await laTrabajaAlguien(repo, await buscarTarjeta(repo, id), () => true)).toBe(false);
  });

  it("el «dale» de una trabada ya no se rechaza: la destraba y arranca", async () => {
    const id = await haciendo();
    const corridas: string[] = [];
    const servidor = crearServidor({ repo, calendario: false, correrTarjeta: (_r, p) => corridas.push(p.tarjeta), demo: true });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
    const token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1] ?? "";
    const pensado = await (
      await fetch(`${base}/api/tablero/${id}/plan`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-dolphin-token": token },
        body: JSON.stringify({ agente: "mentira" }),
      })
    ).json();
    await new Promise((listo) => servidor.close(listo));

    expect(pensado.ok).toBe(true);
    expect((await buscarTarjeta(repo, id)).columna).toBe("para-hacer");
  });
});
