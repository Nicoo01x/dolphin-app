import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { crearServidor } from "../src/servidor.js";

/**
 * La cola desde la consola, por el camino REAL: el servidor lanza el proceso
 * de Dolphin de verdad (sin sembrador inyectado). Es lo que prueba que un
 * pedido de varias líneas llega entero — antes, por cmd.exe, llegaba cortado
 * en el primer salto de línea.
 */

const correr = promisify(execFile);

describe("la cola desde la consola", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-cola-api-"));
    await writeFile(join(repo, "leeme.txt"), "hola\n");
    for (const args of [["init", "-q"], ["config", "user.email", "nico@ejemplo.com"], ["config", "user.name", "Nico"], ["add", "-A"], ["commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    servidor = crearServidor({ repo });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await correr("git", ["worktree", "prune"], { cwd: repo }).catch(() => {});
    await borrarCarpeta(repo);
  });

  const pase = async () => /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1];

  it("una cola de una sola tarea no es una cola", async () => {
    const token = await pase();
    if (!token) return;
    const r = await fetch(`${base}/api/cola`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dolphin-token": token },
      body: JSON.stringify({ tareas: ["sola"], agente: "mentira" }),
    });
    expect(r.status).toBe(400);
  });

  it("lanza la cola de verdad y un pedido de varias líneas llega entero", { timeout: 90_000 }, async () => {
    const token = await pase();
    if (!token) return;
    const multilinea = "Sumá el reporte de ventas\ncon el detalle por mes";
    const r = await fetch(`${base}/api/cola`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dolphin-token": token },
      body: JSON.stringify({ tareas: [multilinea, "Validá el CUIT del alta"], agente: "mentira" }),
    });
    expect(r.status).toBe(202);

    let tareas: { tarea: string; estado: string }[] = [];
    await esperarA(async () => {
      tareas = (await (await fetch(`${base}/api/cola`)).json()).tareas;
      return tareas.length === 2 && tareas.every((t) => ["lista", "no-salio", "en-conflicto"].includes(t.estado));
    }, { tope: 80_000, paso: 500 });
    expect(tareas.map((t) => t.estado)).toEqual(["lista", "lista"]);
    expect(tareas[0]!.tarea).toBe(multilinea);
  });
});
