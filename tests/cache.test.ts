import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { agenteConMemoria, aprobarRespuestas, buscarRespuesta, claveDeTrabajo } from "../src/nucleo/cache.js";
import { medirForma } from "../src/nucleo/forma.js";
import type { Agente, Universo } from "../src/nucleo/tipos.js";

/**
 * La memoria de respuestas: lo que el modelo ya contestó una vez no se
 * vuelve a pagar. La clave es (modelo + tarea + HEAD): mismo pedido sobre
 * el mismo código, misma respuesta.
 */

const correr = promisify(execFile);

describe("la memoria de respuestas", () => {
  let repo = "";
  let worktreeA = "";
  let worktreeB = "";

  const clonar = async (destino: string) => {
    await correr("git", ["clone", "-q", repo, destino], { windowsHide: true });
  };

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-cache-"));
    await writeFile(join(repo, "plata.js"), "export const conIva = (n) => n + 0.21;\n");
    await correr("git", ["init", "-q"], { cwd: repo });
    await correr("git", ["add", "-A"], { cwd: repo });
    await correr("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: repo });
    worktreeA = join(repo, ".wa");
    worktreeB = join(repo, ".wb");
    await clonar(worktreeA);
    await clonar(worktreeB);
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  const universo = (ruta: string): Universo => ({ id: "u1", rama: "x", ruta, nacido: 0 });

  /** Un agente que escribe de verdad y cuenta cuántas veces lo llamaron. */
  const agenteContado = () => {
    let llamadas = 0;
    const agente: Agente = {
      nombre: "espía",
      async trabajar(u) {
        llamadas += 1;
        await writeFile(join(u.ruta, "plata.js"), "export const conIva = (n) => n * 1.21;\n");
        return {
          forma: await medirForma(u.ruta),
          gastado: 0.08,
          modelo: "espía-1",
          contrato: { superficies: ["/precios"], resumen: "aplica el IVA multiplicando", nota: "el IVA vive en plata.js" },
        };
      },
    };
    return { agente, veces: () => llamadas };
  };

  it("la segunda vez sale de la memoria: cero gasto y el ahorro informado", async () => {
    const { agente, veces } = agenteContado();
    const conMemoria = agenteConMemoria(agente, repo);

    const primero = await conMemoria.trabajar(universo(worktreeA), "arreglá el IVA");
    expect(primero.gastado).toBeCloseTo(0.08);
    expect(primero.deCache).toBeUndefined();
    // La rama pasó el portón: recién ahí su respuesta queda para reusar.
    await aprobarRespuestas([worktreeA]);

    const segundo = await conMemoria.trabajar(universo(worktreeB), "arreglá el IVA");
    expect(veces()).toBe(1); // el modelo no se volvió a llamar
    expect(segundo.deCache).toBe(true);
    expect(segundo.gastado).toBe(0);
    expect(segundo.ahorro).toBeCloseTo(0.08);
    expect(segundo.modelo).toBe("espía-1");
    expect(segundo.contrato?.resumen).toBe("aplica el IVA multiplicando");
    // Las superficies vuelven con el parche: son las que le dicen al portón qué pantalla mirar (se perdían; pasó en el modo live).
    expect(segundo.contrato?.superficies).toEqual(["/precios"]);
    // La nota no: una respuesta repetida no es otra observación del repo.
    expect(segundo.contrato?.nota).toBeUndefined();

    // Y el parche se aplicó DE VERDAD en el segundo worktree.
    const texto = await readFile(join(worktreeB, "plata.js"), "utf8");
    expect(texto).toContain("n * 1.21");
  });

  it("otra tarea, otro código, otro motor u otro contexto es otra clave: no se mezclan respuestas", async () => {
    expect(claveDeTrabajo("m", "tarea A", "cabeza1")).not.toBe(claveDeTrabajo("m", "tarea B", "cabeza1"));
    expect(claveDeTrabajo("m", "tarea A", "cabeza1")).not.toBe(claveDeTrabajo("m", "tarea A", "cabeza2"));
    expect(claveDeTrabajo("m1", "tarea A", "cabeza1")).not.toBe(claveDeTrabajo("m2", "tarea A", "cabeza1"));
    // Codex y Antigravity sin modelo; y la misma tarea después de que la memoria aprendió algo.
    expect(claveDeTrabajo(undefined, "tarea A", "cabeza1", "codex\n")).not.toBe(claveDeTrabajo(undefined, "tarea A", "cabeza1", "antigravity\n"));
    expect(claveDeTrabajo("m", "tarea A", "cabeza1", "claude\n")).not.toBe(claveDeTrabajo("m", "tarea A", "cabeza1", "claude\nNo dejes console.log"));
  });

  it("la respuesta de una rama que no pasó el portón no se reusa", async () => {
    const { agente, veces } = agenteContado();
    const conMemoria = agenteConMemoria(agente, repo);
    await conMemoria.trabajar(universo(worktreeA), "arreglá el IVA");
    // Sin aprobar: la rama murió en el portón.
    const segundo = await conMemoria.trabajar(universo(worktreeB), "arreglá el IVA");
    expect(segundo.deCache).toBeUndefined();
    expect(veces()).toBe(2);
  });

  it("si el parche guardado ya no aplica, se cae al agente sin ruido", async () => {
    const { agente, veces } = agenteContado();
    const conMemoria = agenteConMemoria(agente, repo);
    await conMemoria.trabajar(universo(worktreeA), "arreglá el IVA");
    await aprobarRespuestas([worktreeA]);

    // El worktree B diverge: el parche guardado ya no aplica limpio.
    await writeFile(join(worktreeB, "plata.js"), "export const conIva = (n) => {\n  return n + 0.21;\n};\n");

    const segundo = await conMemoria.trabajar(universo(worktreeB), "arreglá el IVA");
    expect(segundo.deCache).toBeUndefined();
    expect(veces()).toBe(2); // tuvo que trabajar de verdad
  });

  it("lo guardado queda en .dolphin/cache del repo principal", async () => {
    const { agente } = agenteContado();
    const conMemoria = agenteConMemoria(agente, repo);
    await conMemoria.trabajar(universo(worktreeA), "arreglá el IVA");

    const { stdout } = await correr("git", ["rev-parse", "HEAD"], { cwd: worktreeA, windowsHide: true });
    const clave = claveDeTrabajo(undefined, "arreglá el IVA\n", stdout.trim(), "espía\n");
    const guardada = await buscarRespuesta(repo, clave, { aunPendiente: true });
    expect(guardada?.parche).toContain("n * 1.21");
    expect(guardada?.gastadoOriginal).toBeCloseTo(0.08);
  });
});
