import { execFile } from "node:child_process";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearServidor } from "../src/servidor.js";
import { prepararSiembra, sembrarTarea } from "../src/siembra.js";

/**
 * Una siembra de verdad (con el motor Demo) entrega su rama, y la consola
 * la mergea o la descarta: el estado se le pregunta a git.
 */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();

describe("la rama elegida desde la consola", () => {
  let repo = "";
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-rama-api-"));
    await writeFile(join(repo, "leeme.txt"), "hola\n");
    await git(["init", "-q", "-b", "main"], repo);
    await git(["config", "user.email", "nico@ejemplo.com"], repo);
    await git(["config", "user.name", "Nico"], repo);
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "base"], repo);
    servidor = crearServidor({ repo });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
    await git(["worktree", "prune"], repo).catch(() => "");
    await borrarCarpeta(repo);
  });

  const sembrarDemo = async (tarea: string) => {
    const pedido = { repo, tarea, agente: "mentira" as const };
    return sembrarTarea(pedido, await prepararSiembra(pedido));
  };

  const idDe = async (donde: string) => (await readdir(join(repo, ".dolphin", "cosechas"))).find((n) => donde.endsWith(n))!;

  const pase = async () => /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1];

  const mandar = (cuerpo: unknown, token?: string) =>
    fetch(`${base}/api/rama`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-dolphin-token": token } : {}) },
      body: JSON.stringify(cuerpo),
    });

  it("una siembra entrega su rama con un commit del dueño, y la cosecha dice «probada»", async () => {
    const { cosecha, donde } = await sembrarDemo("Sumá el reporte de ventas");
    expect(cosecha.entregada).toMatchObject({ ramaBase: "main" });
    expect(await git(["log", "-1", "--format=%an|%s", cosecha.entregada!.commit], repo)).toBe("Nico|dolphin: Sumá el reporte de ventas");

    const r = await (await fetch(`${base}/api/cosecha?id=${encodeURIComponent(await idDe(donde))}`)).json();
    expect(r.estadoRama).toBe("probada");
  });

  it("mergear exige el pase; con el pase, la rama queda mergeada en main", async () => {
    const { cosecha, donde } = await sembrarDemo("Sumá el reporte de ventas");
    const id = await idDe(donde);
    expect((await mandar({ accion: "mergear", id })).status).toBe(403);

    const token = await pase();
    if (!token) return;
    const r = await mandar({ accion: "mergear", id }, token);
    expect(r.status).toBe(200);
    expect((await r.json()).estadoRama).toBe("mergeada");
    expect(await git(["log", "-1", "--format=%s", "main"], repo)).toBe("Mergea dolphin: Sumá el reporte de ventas");
    await expect(git(["merge-base", "--is-ancestor", cosecha.entregada!.commit, "main"], repo)).resolves.toBeDefined();
  });

  it("descartar deja la rama descartada", async () => {
    const { donde } = await sembrarDemo("Algo que no va");
    const token = await pase();
    if (!token) return;
    const r = await mandar({ accion: "descartar", id: await idDe(donde) }, token);
    expect((await r.json()).estadoRama).toBe("descartada");
  });
});
