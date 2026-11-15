import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { agenteClaude, PEDIDO_AL_SEGUIR } from "../src/agentes/claude.js";
import type { Universo } from "../src/nucleo/tipos.js";

/**
 * Un agente que se queda mudo se mata y se retoma su sesión. Lo que se le manda al retomar depende de
 * si alcanzó a contestar: si contestó, el pedido ya está en la sesión y repetirlo entero lo hacía
 * arrancar de nuevo sobre su propio trabajo. Un CLI de Claude falso: nada sale a la red.
 */

const correr = promisify(execFile);

// La primera vez anuncia la sesión (y, según FALSO_MODO, empieza a contestar) y se cuelga; la segunda contesta.
const FALSO = `
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
let prompt = "";
process.stdin.on("data", (t) => (prompt += t));
process.stdin.on("end", () => {
  appendFileSync(process.env.FALSO_CLAUDE_LOG, JSON.stringify({ args, prompt }) + "\\n");
  const vueltas = process.env.FALSO_CLAUDE_VUELTAS;
  const n = existsSync(vueltas) ? Number(readFileSync(vueltas, "utf8")) : 0;
  writeFileSync(vueltas, String(n + 1));
  if (n === 0) {
    process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "s-1" }) + "\\n");
    if (process.env.FALSO_MODO === "contesto") process.stdout.write(JSON.stringify({ type: "assistant", session_id: "s-1", message: { content: [] } }) + "\\n");
    setInterval(() => {}, 1000);
    return;
  }
  appendFileSync("trabajo.txt", "una vuelta\\n");
  const result = "listo\\nSUPERFICIES: ninguna\\nRESUMEN: hecho\\nNOTA: ninguna";
  process.stdout.write(JSON.stringify({ type: "result", result, is_error: false, total_cost_usd: 0.05, session_id: "s-1" }) + "\\n");
});
`;

describe("retomar después de un silencio", () => {
  let carpeta = "";
  let repo = "";
  let cmd = "";
  let log = "";
  const universo = (): Universo => ({ id: "u1", rama: "dolphin/c1", ruta: repo, nacido: 0 });
  const llamadas = async () =>
    (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { args: string[]; prompt: string });

  beforeEach(async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-silencio-"));
    repo = join(carpeta, "repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "precio.js"), "export const conIva = (n) => n * 1.21;\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    await writeFile(join(carpeta, "claude-falso.mjs"), FALSO);
    if (process.platform === "win32") {
      cmd = join(carpeta, "claude-falso.cmd");
      await writeFile(cmd, `@node "%~dp0claude-falso.mjs" %*\r\n`);
    } else {
      cmd = join(carpeta, "claude-falso");
      await writeFile(cmd, `#!/bin/sh\nexec node "$(dirname "$0")/claude-falso.mjs" "$@"\n`);
      await chmod(cmd, 0o755);
    }
    log = join(carpeta, "llamadas.jsonl");
    process.env.FALSO_CLAUDE_LOG = log;
    process.env.FALSO_CLAUDE_VUELTAS = join(carpeta, "vueltas.txt");
  });

  afterEach(async () => {
    delete process.env.FALSO_CLAUDE_LOG;
    delete process.env.FALSO_CLAUDE_VUELTAS;
    delete process.env.FALSO_MODO;
    await borrarCarpeta(carpeta);
  });

  it("si alcanzó a contestar, retoma con «seguí donde quedaste» y no con el pedido entero", async () => {
    process.env.FALSO_MODO = "contesto";
    const agente = agenteClaude({ cmd, silencio: 2_000, esperar: async () => undefined });
    const hecho = await agente.trabajar(universo(), "sumá descuento(precio, porcentaje)");
    expect(hecho.forma.archivos).toBeGreaterThan(0);
    const [primera, segunda] = await llamadas();
    expect(primera!.args).not.toContain("--resume");
    expect(primera!.prompt).toContain("sumá descuento(precio, porcentaje)");
    expect(segunda!.args.join(" ")).toContain("--resume s-1");
    expect(segunda!.prompt).toBe(PEDIDO_AL_SEGUIR);
  }, 20_000);

  it("si no alcanzó a contestar nada, puede no haber recibido el pedido: va entero", async () => {
    const agente = agenteClaude({ cmd, silencio: 2_000, esperar: async () => undefined });
    await agente.trabajar(universo(), "sumá descuento(precio, porcentaje)");
    const [, segunda] = await llamadas();
    expect(segunda!.args.join(" ")).toContain("--resume s-1");
    expect(segunda!.prompt).toContain("sumá descuento(precio, porcentaje)");
  }, 20_000);
});
