import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { carpetaDeBandeja, leerBandeja, sumarAsuntos } from "../src/nucleo/bandeja.js";
import { crearServidor, type PedidoDeSiembra } from "../src/servidor.js";

/**
 * La bandeja desde la consola: rechazar, reabrir e implementar. Implementar
 * siembra UNA rama que corre sola —con la política encima— y deja el
 * asunto «implementando» para que dos clics no siembren dos veces.
 */

describe("la API de la bandeja", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";
  const pedidos: PedidoDeSiembra[] = [];

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-bandeja-api-"));
    pedidos.length = 0;
    servidor = crearServidor({ repo, sembrar: (p) => pedidos.push(p) });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(repo);
  });

  const sembrarDosAsuntos = async () => {
    await mkdir(carpetaDeBandeja(repo), { recursive: true });
    await writeFile(join(carpetaDeBandeja(repo), "guardar.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const { sumados } = await sumarAsuntos(repo, [
      {
        tipo: "idea",
        titulo: "Deshacer con Ctrl+Z",
        detalle: "Linear deja deshacer durante 10 segundos.",
        fuentes: [{ titulo: "Linear", url: "https://linear.app/changelog" }],
        origen: "scout",
      },
      {
        tipo: "error",
        titulo: "El botón Guardar no hace nada",
        detalle: "Toqué «Guardar» y no pasó nada.",
        donde: "/alta",
        pasos: ["Abrí /alta", "Tocá «Guardar»"],
        captura: "guardar.png",
        origen: "explorador",
      },
    ]);
    return { idea: sumados[0]!, error: sumados[1]! };
  };

  const pase = async (): Promise<string | undefined> => {
    const pagina = await (await fetch(`${base}/`)).text();
    return /name="dolphin-token" content="([0-9a-f]+)"/.exec(pagina)?.[1];
  };

  const mandar = (cuerpo: unknown, token?: string) =>
    fetch(`${base}/api/bandeja`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-dolphin-token": token } : {}) },
      body: JSON.stringify(cuerpo),
    });

  it("lista lo que hay en la bandeja", async () => {
    await sembrarDosAsuntos();
    const r = await (await fetch(`${base}/api/bandeja`)).json();
    expect(r.asuntos.map((a: { titulo: string }) => a.titulo)).toEqual(["Deshacer con Ctrl+Z", "El botón Guardar no hace nada"]);
  });

  it("decidir un asunto exige el pase de la consola", async () => {
    const { idea } = await sembrarDosAsuntos();
    const r = await mandar({ accion: "rechazar", id: idea.id });
    expect(r.status).toBe(403);
    expect((await leerBandeja(repo)).asuntos[0]!.estado).toBe("abierto");
  });

  it("anotar deja la idea en el tablero y la saca de la bandeja", async () => {
    const { idea } = await sembrarDosAsuntos();
    const token = await pase();
    if (!token) return; // sin la consola construida no hay pase: el endpoint queda cerrado

    const r = await mandar({ accion: "anotar", id: idea.id }, token);
    expect(r.status).toBe(200);
    const cuerpo = (await r.json()) as { ok: boolean; tarjeta: { titulo: string; columna: string } };
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.tarjeta.titulo).toBe("Deshacer con Ctrl+Z");
    expect(cuerpo.tarjeta.columna).toBe("ideas");
    expect((await leerBandeja(repo)).asuntos[0]!.estado).toBe("anotado");
    // No siembra nada: anotar no gasta.
    expect(pedidos).toHaveLength(0);
  });

  it("rechazar, reabrir e implementar, con el pase", async () => {
    const { idea, error } = await sembrarDosAsuntos();
    const token = await pase();
    if (!token) return; // sin la consola construida no hay pase: el endpoint queda cerrado

    expect((await mandar({ accion: "rechazar", id: idea.id }, token)).status).toBe(200);
    expect((await leerBandeja(repo)).asuntos[0]!.estado).toBe("rechazado");
    expect((await mandar({ accion: "reabrir", id: idea.id }, token)).status).toBe(200);
    expect((await leerBandeja(repo)).asuntos[0]!.estado).toBe("abierto");

    const implementar = await mandar({ accion: "implementar", id: error.id }, token);
    expect(implementar.status).toBe(202);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ n: 1, agente: "claude", automatico: true, asunto: error.id });
    expect(pedidos[0]!.tarea).toContain("Arreglá este error");
    expect(pedidos[0]!.tarea).toContain("2. Tocá «Guardar»");
    expect((await leerBandeja(repo)).asuntos[1]!.estado).toBe("implementando");

    // El segundo clic no siembra otra rama para lo mismo.
    const otraVez = await mandar({ accion: "implementar", id: error.id }, token);
    expect(otraVez.status).toBe(409);
    expect(pedidos).toHaveLength(1);
  });

  it("un asunto que no existe es un 404 claro", async () => {
    const token = await pase();
    if (!token) return;
    const r = await mandar({ accion: "rechazar", id: "no-existe" }, token);
    expect(r.status).toBe(404);
  });

  it("aprueba y desaprueba un asunto para esta noche, y no permite hacerlo si ya arrancó", async () => {
    const { idea } = await sembrarDosAsuntos();
    const token = await pase();
    if (!token) return;
    expect((await mandar({ accion: "noche", id: idea.id }, token)).status).toBe(200);
    expect((await leerBandeja(repo)).asuntos.find((a) => a.id === idea.id)).toMatchObject({ estado: "abierto", paraLaNoche: expect.any(String) });
    expect((await mandar({ accion: "sacar-de-la-noche", id: idea.id }, token)).status).toBe(200);
    expect((await leerBandeja(repo)).asuntos.find((a) => a.id === idea.id)?.paraLaNoche).toBeUndefined();
    await mandar({ accion: "implementar", id: idea.id }, token);
    expect((await mandar({ accion: "noche", id: idea.id }, token)).status).toBe(409);
  });

  it("sirve las capturas de la bandeja, y nada de afuera de su carpeta", async () => {
    await sembrarDosAsuntos();
    const captura = await fetch(`${base}/bandeja/guardar.png`);
    expect(captura.status).toBe(200);
    expect(captura.headers.get("content-type")).toBe("image/png");

    const afuera = await fetch(`${base}/bandeja/..%2F..%2Fpackage.json`);
    expect(afuera.status).toBe(404);
  });
});
