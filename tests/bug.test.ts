import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { deBugAArreglo, INTENTOS_DE_ARREGLO, pedidoDeReproducir, type Arreglo } from "../src/bug.js";
import type { Agente } from "../src/nucleo/tipos.js";

/**
 * Del bug al arreglo con git de verdad: la prueba primero (y tiene que fallar), el arreglo encima y
 * no está arreglado hasta que esa prueba pasa. El agente que escribe la prueba es de mentira, pero la
 * prueba que deja es real y se corre.
 */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();
let repo = "";
const extras: string[] = [];

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-bug-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module" }));
  // El bug: el descuento del 10 % no se aplica.
  await writeFile(join(repo, "src", "precio.js"), "export const conDescuento = (p) => p\n");
  await git(["init", "-q", "-b", "main"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});
afterEach(async () => {
  for (const r of extras.splice(0)) await git(["worktree", "remove", "--force", r], repo).catch(() => {});
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

/** El que escribe la prueba: la deja en tests/bug.mjs y el comando en .dolphin-prueba. */
const agenteQueReproduce = (prueba: string, comando: string | null = "node tests/bug.mjs"): Agente => ({
  nombre: "prueba",
  async trabajar(universo) {
    await mkdir(join(universo.ruta, "tests"), { recursive: true });
    await writeFile(join(universo.ruta, "tests", "bug.mjs"), prueba);
    if (comando) await writeFile(join(universo.ruta, ".dolphin-prueba"), `${comando}\n`);
    return { forma: { archivos: 1, agregadas: 3, quitadas: 0, dependenciasNuevas: 0 }, gastado: 0.05 };
  },
});

const PRUEBA_QUE_FALLA = [
  'import { conDescuento } from "../src/precio.js";',
  "const r = conDescuento(100);",
  'if (r !== 90) { console.log(`con 100 da ${r} y tenía que dar 90`); process.exit(1); }',
  'console.log("el descuento se aplica");',
].join("\n");

/** Un arreglo hecho a mano sobre el commit de la prueba, en su propio worktree. */
async function arregloCon(codigo: string, base: string, n: number): Promise<Arreglo> {
  const ruta = `${repo}-arreglo-${n}`;
  extras.push(ruta);
  await git(["worktree", "add", "-q", "-b", `arreglo-${n}`, ruta, base], repo);
  await writeFile(join(ruta, "src", "precio.js"), codigo);
  return { rama: `arreglo-${n}`, ruta, porQue: "pasó el portón", gastado: 0.2 };
}

describe("del bug al arreglo", () => {
  it("la prueba falla primero; el arreglo que no alcanza da la pista y el segundo lo arregla", async () => {
    const pedidos: string[] = [];
    const contado: string[] = [];
    let primerArreglo = "";
    const r = await deBugAArreglo(
      { repo, descripcion: "el cupón del 10 % no descuenta nada", elemento: "Botón «Aplicar cupón» en Tienda — Chrome", agente: "mentira" },
      {
        agente: agenteQueReproduce(PRUEBA_QUE_FALLA),
        arreglar: async (pedido, base) => {
          pedidos.push(pedido.tarea);
          const arreglo = pedidos.length === 1 ? await arregloCon("export const conDescuento = (p) => p * 0.8\n", base, 1) : await arregloCon("export const conDescuento = (p) => p * 0.9\n", base, 2);
          if (pedidos.length === 1) primerArreglo = arreglo.ruta!;
          return arreglo;
        },
        contar: (t) => contado.push(t),
      },
    );
    expect(r).toMatchObject({ etapa: "arreglado", prueba: "node tests/bug.mjs", intentos: 2, rama: "arreglo-2" });
    expect(r.antes).toMatchObject({ paso: false, salida: "con 100 da 100 y tenía que dar 90" });
    expect(r.despues).toMatchObject({ paso: true, salida: "el descuento se aplica" });
    expect(r.gastado).toBeCloseTo(0.45);
    expect(contado[1]).toBe("La prueba lo reproduce (falla): con 100 da 100 y tenía que dar 90");
    // El segundo intento llevó lo que imprimió la prueba en el primero.
    expect(pedidos[1]).toContain("con 100 da 80 y tenía que dar 90");
    expect(pedidos[0]).toContain("Ya hay una prueba que lo reproduce y hoy falla: `node tests/bug.mjs`");
    // El arreglo está encima del commit de la prueba: la prueba viaja con él.
    expect(await git(["log", "--format=%s", "-1", "arreglo-2"], repo)).toBe("prueba: reproduce «el cupón del 10 % no descuenta nada»");
    expect(await git(["worktree", "list"], repo)).not.toContain(primerArreglo);
  });

  it("si la prueba ya pasa hoy, no reproduce nada y no se arregla a ciegas", async () => {
    let arreglos = 0;
    const r = await deBugAArreglo(
      { repo, descripcion: "algo", agente: "mentira" },
      { agente: agenteQueReproduce('console.log("anda")'), arreglar: async () => (arreglos++, { porQue: "", gastado: 0 }) },
    );
    expect(r).toMatchObject({ etapa: "no-reproducido", porQue: "la prueba pasa con el código de hoy: no reproduce el bug, y no lo arreglo a ciegas" });
    expect(arreglos).toBe(0);
  });

  it("sin el comando de la prueba, no sigue", async () => {
    const r = await deBugAArreglo({ repo, descripcion: "algo", agente: "mentira" }, { agente: agenteQueReproduce(PRUEBA_QUE_FALLA, null) });
    expect(r).toMatchObject({ etapa: "no-reproducido", porQue: "el agente no dejó el comando de la prueba en .dolphin-prueba" });
  });

  it("no toma como reproducción un comando que apunta a un test inexistente", async () => {
    let arreglos = 0;
    const r = await deBugAArreglo(
      { repo, descripcion: "algo", agente: "mentira" },
      { agente: agenteQueReproduce(PRUEBA_QUE_FALLA, "node tests/no-existe.mjs"), arreglar: async () => (arreglos++, { porQue: "no corresponde", gastado: 0 }) },
    );
    expect(r).toMatchObject({ etapa: "no-reproducido", intentos: 0 });
    expect(r.porQue).toContain("no pudo correr");
    expect(arreglos).toBe(0);
  });

  it("si el agente no dejó cambios además del comando, cierra la reproducción sin romper la corrida", async () => {
    await mkdir(join(repo, "tests"), { recursive: true });
    await writeFile(join(repo, "tests", "bug.mjs"), PRUEBA_QUE_FALLA);
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "test base"], repo);
    const agente = ({
      nombre: "solo comando",
      async trabajar(universo) {
        await writeFile(join(universo.ruta, ".dolphin-prueba"), "node tests/bug.mjs\n");
        return { forma: { archivos: 0, agregadas: 0, quitadas: 0, dependenciasNuevas: 0 }, gastado: 0 };
      },
    } satisfies Agente);
    const r = await deBugAArreglo({ repo, descripcion: "algo", agente: "mentira" }, { agente });
    expect(r).toMatchObject({ etapa: "no-reproducido", intentos: 0 });
    expect(r.porQue).toContain("no dejó cambios");
  });

  it("si no lo arregla en tres intentos, la prueba que lo reproduce queda en su rama", async () => {
    const r = await deBugAArreglo(
      { repo, descripcion: "el cupón no descuenta", agente: "mentira" },
      { agente: agenteQueReproduce(PRUEBA_QUE_FALLA), arreglar: async () => ({ porQue: "no pasó typecheck", gastado: 0.1 }) },
    );
    expect(r).toMatchObject({ etapa: "sin-arreglo", intentos: INTENTOS_DE_ARREGLO });
    const rama = /reproducido en (\S+)$/.exec(r.porQue)![1]!;
    expect(await git(["log", "--format=%s", "-1", rama], repo)).toBe("prueba: reproduce «el cupón no descuenta»");
    expect(await git(["show", "--name-only", "--format=", rama], repo)).toBe("tests/bug.mjs");
  });

  it("el pedido de la prueba lleva lo que viste y lo que señalaste", () => {
    const p = pedidoDeReproducir("no descuenta", "Botón «Aplicar»");
    expect(p).toContain("«no descuenta»");
    expect(p).toContain("Botón «Aplicar»");
    expect(p).toContain("NO arregles nada");
  });
});
