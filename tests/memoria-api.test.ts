import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearServidor } from "../src/servidor.js";

describe("rutas de la memoria", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";
  let token = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-memoria-api-"));
    servidor = crearServidor({ repo, calendario: false });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
    const pagina = await (await fetch(`${base}/`)).text();
    token = pagina.match(/meta name="dolphin-token" content="([^"]+)"/)?.[1] ?? "";
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await borrarCarpeta(repo);
  });

  const mandar = (cuerpo: unknown) => fetch(`${base}/api/memoria`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-dolphin-token": token },
    body: JSON.stringify(cuerpo),
  });

  it("lista, aprueba con edición, edita, apaga y borra", async () => {
    const creada = await (await mandar({ accion: "candidato", dicho: "usá fetch", porQue: "lo corregiste en sesión" })).json() as { recuerdo: { id: string } };
    const id = creada.recuerdo.id;
    expect((await (await fetch(`${base}/api/memoria`)).json()).recuerdos[0]).toMatchObject({ candidato: true, usos: 0 });

    expect((await mandar({ accion: "aprobar-candidato", id, dicho: "usá fetch con timeout" })).status).toBe(200);
    expect((await mandar({ accion: "editar", id, dicho: "usá fetch con timeout y señal" })).status).toBe(200);
    expect((await mandar({ accion: "apagar", id })).status).toBe(200);
    expect((await mandar({ accion: "prender", id })).status).toBe(200);
    expect((await mandar({ accion: "olvidar", id })).status).toBe(200);
    expect((await (await fetch(`${base}/api/memoria`)).json()).recuerdos).toEqual([]);
  });

  it("descarta desde la API", async () => {
    const creada = await (await mandar({ accion: "candidato", dicho: "usá pnpm", porQue: "lo pidió la persona" })).json() as { recuerdo: { id: string } };
    expect((await mandar({ accion: "descartar-candidato", id: creada.recuerdo.id })).status).toBe(200);
    expect((await (await fetch(`${base}/api/memoria`)).json()).recuerdos).toEqual([]);
  });
});
