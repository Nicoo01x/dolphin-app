import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cambiarEstado,
  latirAsunto,
  leerBandeja,
  liberarCortados,
  soltarAsunto,
  sumarAsuntos,
  tomarAsunto,
} from "../src/nucleo/bandeja.js";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearServidor, type PedidoDeSiembra } from "../src/servidor.js";

/**
 * Una siembra que se corta —se cerró la app en el medio— no llega a devolver
 * su asunto. Pasó el 22/10: la idea quedó «implementando» para siempre e
 * Implementar contestaba 409. Ahora la siembra toma el asunto al arrancar y
 * late cada minuto; lo que implementaba un proceso que no existe, o que dejó
 * de latir, vuelve a abierto con la constancia del corte.
 */

let repo = "";
const MIN = 60_000;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-cortada-"));
});

afterEach(async () => {
  await borrarCarpeta(repo);
});

async function unaIdea() {
  const { sumados } = await sumarAsuntos(repo, [
    { tipo: "idea", titulo: "Entregar la rama como PR", detalle: "Abrir un draft PR con la evidencia.", origen: "scout" },
  ]);
  return sumados[0]!;
}

const estado = async () => (await leerBandeja(repo)).asuntos[0]!;

/** Como quedó la idea del 22/10: «implementando» y sin ninguna constancia de quién. */
async function colgadaDeAntes() {
  const idea = await unaIdea();
  const ruta = join(repo, ".dolphin", "bandeja.json");
  const bandeja = JSON.parse(await readFile(ruta, "utf8")) as { asuntos: Record<string, unknown>[] };
  bandeja.asuntos[0]!.estado = "implementando";
  await writeFile(ruta, JSON.stringify(bandeja));
  return idea;
}

describe("la siembra que implementa un asunto", () => {
  it("lo toma al arrancar, el servidor no le borra el pid, y al terminar lo suelta sin constancias", async () => {
    const idea = await unaIdea();
    await cambiarEstado(repo, idea.id, "implementando");
    expect((await tomarAsunto(repo, idea.id, 4242))?.implementando?.pid).toBe(4242);
    // El servidor marca después de lanzar: si la siembra ya lo tomó, el pid queda.
    expect((await cambiarEstado(repo, idea.id, "implementando"))?.implementando?.pid).toBe(4242);
    expect(await soltarAsunto(repo, idea.id, 4242, "hecho")).toMatchObject({ estado: "hecho" });
    expect((await estado()).implementando).toBeUndefined();
  });

  it("no pisa un asunto que alguien rechazó mientras tanto", async () => {
    const idea = await unaIdea();
    await cambiarEstado(repo, idea.id, "rechazado");
    expect(await tomarAsunto(repo, idea.id, 4242)).toBeNull();
    expect((await estado()).estado).toBe("rechazado");
    // Y al terminar tampoco lo vuelve a abrir.
    expect(await soltarAsunto(repo, idea.id, 4242, "abierto")).toBeNull();
    expect((await estado()).estado).toBe("rechazado");
  });

  it("una siembra no suelta el asunto que ya tomó otra", async () => {
    const idea = await unaIdea();
    await tomarAsunto(repo, idea.id, 1111);
    await tomarAsunto(repo, idea.id, 2222);
    expect(await soltarAsunto(repo, idea.id, 1111, "abierto")).toBeNull();
    expect((await estado()).implementando?.pid).toBe(2222);
  });
});

describe("la siembra que se cortó", () => {
  it("una siembra viva que tarda en preparar —más de dos minutos— no se da por cortada mientras late", async () => {
    const idea = await unaIdea();
    const t0 = Date.now();
    await cambiarEstado(repo, idea.id, "implementando");
    await tomarAsunto(repo, idea.id, 4242, new Date(t0));
    // Medir la línea base lleva cinco minutos; late cada uno.
    for (let m = 1; m <= 5; m++) await latirAsunto(repo, idea.id, 4242, t0 + m * MIN);
    expect(await liberarCortados(repo, () => true, new Date(t0 + 5.5 * MIN))).toEqual([]);
    expect((await estado()).estado).toBe("implementando");
  });

  it("con el proceso muerto vuelve a abierta enseguida, con la constancia del corte", async () => {
    const idea = await unaIdea();
    await tomarAsunto(repo, idea.id, 4242);
    const ahora = new Date();
    const [liberada] = await liberarCortados(repo, (pid) => pid !== 4242, ahora);
    expect(liberada).toMatchObject({ id: idea.id, estado: "abierto", cortado: { en: ahora.toISOString() } });
    expect(liberada!.implementando).toBeUndefined();
    // Volver a implementarla borra la constancia del corte.
    expect((await cambiarEstado(repo, idea.id, "implementando"))?.cortado).toBeUndefined();
  });

  it("un pid que Windows le dio a otro programa no la deja trabada: sin latido tres minutos, se libera", async () => {
    const idea = await unaIdea();
    const t0 = Date.now();
    await tomarAsunto(repo, idea.id, 4242, new Date(t0));
    expect(await liberarCortados(repo, () => true, new Date(t0 + 2 * MIN))).toEqual([]);
    expect((await liberarCortados(repo, () => true, new Date(t0 + 4 * MIN))).map((a) => a.id)).toEqual([idea.id]);
  });

  it("recién lanzada, sin pid ni latido, espera a que la siembra la tome, pero no para siempre", async () => {
    const idea = await unaIdea();
    await cambiarEstado(repo, idea.id, "implementando");
    const desde = Date.parse((await estado()).implementando!.desde);
    expect(await liberarCortados(repo, () => true, new Date(desde + MIN))).toEqual([]);
    expect(await liberarCortados(repo, () => true, new Date(desde + 4 * MIN))).toHaveLength(1);
  });

  it("lo que quedó colgado antes de que se anotara el proceso vuelve a abierto", async () => {
    const idea = await colgadaDeAntes();
    expect((await liberarCortados(repo, () => true)).map((a) => a.id)).toEqual([idea.id]);
  });
});

describe("la siembra que se cortó, desde la consola", () => {
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";
  const pedidos: PedidoDeSiembra[] = [];

  beforeEach(async () => {
    pedidos.length = 0;
    servidor = crearServidor({ repo, calendario: false, sembrar: (p) => pedidos.push(p) });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
  });

  it("la bandeja ya la muestra abierta, e Implementar vuelve a sembrar en vez de contestar 409", async () => {
    const idea = await colgadaDeAntes();
    const { asuntos } = (await (await fetch(`${base}/api/bandeja`)).json()) as { asuntos: { id: string; estado: string; cortado?: unknown }[] };
    expect(asuntos[0]).toMatchObject({ id: idea.id, estado: "abierto", cortado: { porQue: expect.stringContaining("se cortó") } });

    const pagina = await (await fetch(`${base}/`)).text();
    const token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(pagina)?.[1];
    if (!token) return; // sin la consola construida no hay pase
    const r = await fetch(`${base}/api/bandeja`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dolphin-token": token },
      body: JSON.stringify({ accion: "implementar", id: idea.id }),
    });
    expect(r.status).toBe(202);
    expect(pedidos).toHaveLength(1);
  });
});
