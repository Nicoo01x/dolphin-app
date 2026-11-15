import { createInterface } from "node:readline";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { recordar } from "../src/nucleo/memoria.js";

const correr = promisify(execFile);

describe("servidor MCP de Dolphin", () => {
  let repo = "";
  let proceso: ChildProcessWithoutNullStreams | undefined;
  let leer: ReturnType<typeof createInterface> | undefined;

  /** El servidor de verdad, por stdio, como lo arranca Claude Code. */
  function abrir(ruta: string): (pedido: Record<string, unknown>) => Promise<Record<string, unknown>> {
    proceso = spawn(process.execPath, ["--import", "tsx", join(process.cwd(), "src", "dolphin.ts"), "mcp", "--repo", ruta], { cwd: process.cwd(), windowsHide: true });
    leer = createInterface({ input: proceso.stdout, crlfDelay: Infinity });
    return async (pedido) => {
      proceso!.stdin.write(`${JSON.stringify(pedido)}\n`);
      const linea = await new Promise<string>((resolver, rechazar) => {
        const recibir = (valor: string) => {
          leer!.off("line", recibir);
          resolver(valor);
        };
        leer!.on("line", recibir);
        proceso!.once("error", rechazar);
      });
      return JSON.parse(linea) as Record<string, unknown>;
    };
  }

  /** Lo que devolvió una herramienta, ya parseado. */
  function datos(respuesta: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse((respuesta.result as { content: { text: string }[] }).content[0]!.text) as Record<string, unknown>;
  }

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-mcp-"));
  });

  afterEach(async () => {
    leer?.close();
    proceso?.kill();
    await correr("git", ["worktree", "prune"], { cwd: repo }).catch(() => ({ stdout: "" }));
    await borrarCarpeta(repo);
  });

  it("atiende initialize, tools/list y tools/call por stdio", async () => {
    await recordar(repo, "usá coma decimal");
    const pedir = abrir(repo);

    expect((await pedir({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })).result).toMatchObject({ protocolVersion: "2024-11-05" });
    const lista = await pedir({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    // La lista va EXACTA a propósito: esto es lo que le ofrecemos a un asistente de afuera, así que
    // una herramienta nueva tiene que romper este test para que alguien mire qué permite. Las del
    // tablero sólo miran y agregan a Ideas: no mueven, no editan y no borran (ver tablero-mcp.ts).
    expect((lista.result as { tools: { name: string }[] }).tools.map((x) => x.name)).toEqual([
      "memoria_buscar",
      "memoria_listar",
      "memoria_proponer",
      "perfil_leer",
      "porton_fases",
      "porton_probar",
      "tablero_listar",
      "tablero_ver",
      "tablero_anotar",
      "tablero_comentar",
    ]);
    const buscada = await pedir({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "memoria_buscar", arguments: { consulta: "coma decimal" } } });
    expect(datos(buscada)).toMatchObject({ memoriasRelevantes: [{ recuerdo: { dicho: "usá coma decimal" } }] });
    const propuesta = await pedir({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "memoria_proponer", arguments: { dicho: "no usar console.log", porQue: "lo observé afuera" } } });
    expect(datos(propuesta)).toMatchObject({ candidata: true, recuerdo: { activo: false, candidato: true, origen: "untrusted" } });
  });

  /**
   * El caso que justifica el servidor: un agente que no instaló nada de
   * Dolphin le pregunta si su rama pasa, y recibe el rebote con su motivo.
   */
  it("cruza una rama por el portón y devuelve el rebote con su motivo", async () => {
    const git = (...args: string[]) => correr("git", ["-c", "user.email=n@n", "-c", "user.name=n", ...args], { cwd: repo, windowsHide: true });
    await writeFile(
      join(repo, "package.json"),
      JSON.stringify({ name: "demo", scripts: { test: `node -e "const {existsSync}=require('fs');process.exit(existsSync('roto.txt')?1:0)"` } }),
    );
    await git("init", "-q", "-b", "main");
    await git("add", "-A");
    await git("commit", "-qm", "base");
    await git("checkout", "-q", "-b", "mala");
    await writeFile(join(repo, "roto.txt"), "rompo el test\n");
    await git("add", "-A");
    await git("commit", "-qm", "rompo");
    await git("checkout", "-q", "main");

    const pedir = abrir(repo);
    await pedir({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });

    const fases = await pedir({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "porton_fases", arguments: {} } });
    expect(datos(fases)).toMatchObject({ fases: [{ nombre: "test", costo: "gratis" }] });

    const probada = await pedir({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "porton_probar", arguments: { rama: "mala" } } });
    expect(datos(probada)).toMatchObject({
      rama: "mala",
      paso: false,
      rebote: { fase: "test" },
      fases: [{ nombre: "test", paso: false }],
    });

    const sinRama = await pedir({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "porton_probar", arguments: {} } });
    expect((sinRama.error as { message: string }).message).toContain("necesita rama");
  });
});
