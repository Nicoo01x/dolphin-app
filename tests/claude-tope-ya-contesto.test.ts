import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { agenteClaude, resultadoDelStream } from "../src/agentes/claude.js";
import type { Universo } from "../src/nucleo/tipos.js";

/**
 * Que el CLI no haya SALIDO no significa que no haya TERMINADO.
 *
 * Pasó de verdad el 05/11/2026 con un «prendeme la app»: el agente levantó el dashboard, escribió
 * su respuesta completa a los 5 minutos y se quedó vivo porque dejó el `pnpm dev` de fondo —un
 * hijo que no termina mantiene abiertos los pipes del padre, así que el proceso no sale nunca—. A
 * los 600 s el tope lo mató, se tiró todo lo que había escrito, y la persona vio once minutos de
 * silencio y después un «no salió» por una app que estaba corriendo.
 *
 * Un CLI de Claude falso: nada sale a la red.
 */

const correr = promisify(execFile);

// Trabaja, contesta su resultado y NO se muere: igual que un agente que deja algo de fondo.
const FALSO_QUE_NO_SALE = `
import { appendFileSync } from "node:fs";
let prompt = "";
process.stdin.on("data", (t) => (prompt += t));
process.stdin.on("end", () => {
  appendFileSync("arranque.txt", "levanté el dashboard\\n");
  process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "s-1" }) + "\\n");
  const result = "listo\\nSUPERFICIES: ninguna\\nRESUMEN: el dashboard quedó en http://localhost:3000\\nNOTA: ninguna";
  process.stdout.write(JSON.stringify({ type: "result", result, is_error: false, total_cost_usd: 0.07, session_id: "s-1" }) + "\\n");
  setInterval(() => {}, 1000);
});
`;

// Se cuelga sin contestar nada: acá el tope sí es un fallo.
const FALSO_QUE_NO_CONTESTA = `
let prompt = "";
process.stdin.on("data", (t) => (prompt += t));
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "s-1" }) + "\\n");
  setInterval(() => {}, 1000);
});
`;

describe("el tope cuando el agente ya contestó", () => {
  let carpeta = "";
  let repo = "";
  const universo = (): Universo => ({ id: "u1", rama: "dolphin/c1", ruta: repo, nacido: 0 });

  const cliFalso = async (fuente: string, nombre: string): Promise<string> => {
    await writeFile(join(carpeta, `${nombre}.mjs`), fuente);
    if (process.platform === "win32") {
      const cmd = join(carpeta, `${nombre}.cmd`);
      await writeFile(cmd, `@node "%~dp0${nombre}.mjs" %*\r\n`);
      return cmd;
    }
    const sh = join(carpeta, nombre);
    await writeFile(sh, `#!/bin/sh\nexec node "$(dirname "$0")/${nombre}.mjs" "$@"\n`);
    await chmod(sh, 0o755);
    return sh;
  };

  beforeEach(async () => {
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-tope-"));
    repo = join(carpeta, "repo");
    await mkdir(repo, { recursive: true });
    await writeFile(join(repo, "precio.js"), "export const conIva = (n) => n * 1.21;\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
  });

  afterEach(async () => {
    await borrarCarpeta(carpeta);
  });

  it("el resultado que ya escribió vale, aunque el proceso no salga", async () => {
    const cmd = await cliFalso(FALSO_QUE_NO_SALE, "claude-no-sale");
    // silencio en 0 para que el único corte sea el tope: lo que se está probando es el tope.
    const agente = agenteClaude({ cmd, tope: 3_000, silencio: 0 });
    const hecho = await agente.trabajar(universo(), "prendeme la app");
    expect(hecho.contrato?.resumen).toContain("http://localhost:3000");
    expect(hecho.gastado).toBeCloseTo(0.07, 5);
  }, 30_000);

  it("si no alcanzó a contestar, el tope sigue siendo un fallo", async () => {
    const cmd = await cliFalso(FALSO_QUE_NO_CONTESTA, "claude-mudo");
    const agente = agenteClaude({ cmd, tope: 3_000, silencio: 0 });
    await expect(agente.trabajar(universo(), "prendeme la app")).rejects.toThrow(/no terminó en 3 s/);
  }, 30_000);

  it("una salida sin línea de resultado no es un resultado", () => {
    const aMedias = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "s-1" }),
      JSON.stringify({ type: "assistant", session_id: "s-1", message: { content: [] } }),
    ].join("\n");
    expect(resultadoDelStream(aMedias)).toBeUndefined();
    expect(resultadoDelStream("")).toBeUndefined();
  });
});
