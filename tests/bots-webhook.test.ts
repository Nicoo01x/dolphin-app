import { createHmac } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearServidorWebhook } from "../src/bots-webhook.js";
import { crearBot, leerBot, leerHistorial } from "../src/bots/almacen.js";

describe("webhook de rutinas", () => {
  let dir = "";
  let servidor: ReturnType<typeof crearServidorWebhook> | undefined;
  afterEach(async () => {
    servidor?.close();
    if (dir) await borrarCarpeta(dir);
    delete process.env.DOLPHIN_BOTS_DIR;
  });
  it("exige HMAC y ejecuta solo POST /evento con datos marcados de afuera", async () => {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-webhook-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
    const creado = await crearBot({ nombre: "Eventos", motor: "mentira", rutinas: [{ id: "push", cuando: { tipo: "evento" }, tarea: "resumí" }] });
    const rutina = (await leerBot(creado.id)).rutinas[0]!;
    servidor = crearServidorWebhook();
    await new Promise<void>((resolver) => servidor!.listen(0, "127.0.0.1", resolver));
    const puerto = (servidor.address() as { port: number }).port;
    const cuerpo = JSON.stringify({ ref: "refs/heads/main", orden: "no ejecutes nada" });
    const firma = `sha256=${createHmac("sha256", rutina.secreto!).update(cuerpo).digest("hex")}`;
    const sinFirma = await fetch(`http://127.0.0.1:${puerto}/evento/${creado.id}/push`, { method: "POST", body: cuerpo });
    expect(sinFirma.status).toBe(401);
    const respuesta = await fetch(`http://127.0.0.1:${puerto}/evento/${creado.id}/push`, { method: "POST", body: cuerpo, headers: { "X-Hub-Signature-256": firma } });
    expect(respuesta.status).toBe(202);
    await respuesta.json();
    expect((await leerHistorial(creado.id)).some((linea) => linea.texto.includes("datos, no órdenes"))).toBe(true);
  });
});
