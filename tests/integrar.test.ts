import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { conMarcas, integrarUna, pedidoDeResolver, resolutorConAgente, type Resolutor } from "../src/equipo/integrar.js";
import type { Agente } from "../src/nucleo/tipos.js";

/**
 * La cola de merge del equipo con git de verdad: dos ramas cambian la misma línea; la primera entra
 * limpia y la segunda choca. Con quien resuelva, entra; si la resolución deja marcas, aborta o
 * falla, la integración vuelve a como estaba y lo dice.
 */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();

let repo = "";
let integracion = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-integrar-"));
  integracion = `${repo}-integracion`;
  await writeFile(join(repo, "precio.js"), "export const precio = 100\n");
  await git(["init", "-q"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
  for (const [rama, precio] of [["uno", "120"], ["dos", "90"]] as const) {
    await git(["checkout", "-q", "-b", rama], repo);
    await writeFile(join(repo, "precio.js"), `export const precio = ${precio}\n`);
    await git(["commit", "-qam", `precio ${precio}`], repo);
    await git(["checkout", "-q", "-"], repo);
  }
  await git(["worktree", "add", "-q", "-b", "integracion", integracion], repo);
});

afterEach(async () => {
  await git(["worktree", "remove", "--force", integracion], repo).catch(() => {});
  await Promise.all([repo, integracion].map((r) => borrarCarpeta(r)));
});

const uno = { id: "t1", rama: "uno", titulo: "subir el precio" };
const dos = { id: "t2", rama: "dos", titulo: "bajar el precio" };
const limpio = async () => (await git(["status", "--porcelain"], integracion)) === "";

describe("integrar de a una", () => {
  it("la que no choca entra con su commit de merge", async () => {
    const r = await integrarUna(integracion, uno, null);
    expect(r).toMatchObject({ id: "t1", ok: true, gastado: 0 });
    expect(r.resuelto).toBeUndefined();
    expect(await git(["rev-parse", "HEAD"], integracion)).toBe(r.commit);
  });

  it("la que choca entra si el agente resuelve, y el merge queda cerrado con las dos ramas", async () => {
    await integrarUna(integracion, uno, null);
    const resolver: Resolutor = async ({ ruta, archivos }) => {
      expect(archivos).toEqual(["precio.js"]);
      await writeFile(join(ruta, "precio.js"), "export const precio = 120\nexport const precioOferta = 90\n");
      return { gastado: 0.07 };
    };
    const r = await integrarUna(integracion, dos, resolver);
    expect(r).toMatchObject({ ok: true, resuelto: ["precio.js"], gastado: 0.07 });
    expect(await readFile(join(integracion, "precio.js"), "utf8")).toContain("precioOferta");
    expect(await git(["rev-list", "--parents", "-n", "1", "HEAD"], integracion)).toContain(await git(["rev-parse", "dos"], repo));
    expect(await limpio()).toBe(true);
  });

  it("incluye en el commit los cambios extra necesarios para resolver", async () => {
    await integrarUna(integracion, uno, null);
    const resolver: Resolutor = async ({ ruta }) => {
      await writeFile(join(ruta, "precio.js"), "export const precio = 120\nexport const precioOferta = 90\n");
      await writeFile(join(ruta, "compatibilidad.js"), "export const compatibilidad = true\n");
      return { gastado: 0 };
    };
    const r = await integrarUna(integracion, dos, resolver);
    expect(r.ok).toBe(true);
    expect(await git(["show", "--name-only", "--format=", r.commit!], integracion)).toContain("compatibilidad.js");
  });

  it("si la resolución deja marcas, vuelve atrás y lo dice", async () => {
    await integrarUna(integracion, uno, null);
    const antes = await git(["rev-parse", "HEAD"], integracion);
    const r = await integrarUna(integracion, dos, async () => ({ gastado: 0.02 }));
    expect(r.ok).toBe(false);
    expect(r.porQue).toBe("choca en precio.js y la resolución dejó marcas en precio.js");
    expect(r.gastado).toBe(0.02);
    expect(await git(["rev-parse", "HEAD"], integracion)).toBe(antes);
    expect(await limpio()).toBe(true);
  });

  it("si el agente aborta el merge en vez de resolverlo, no cuenta como integrada", async () => {
    await integrarUna(integracion, uno, null);
    const r = await integrarUna(integracion, dos, async ({ ruta }) => {
      await git(["merge", "--abort"], ruta);
      return { gastado: 0 };
    });
    expect(r).toMatchObject({ ok: false, porQue: "choca en precio.js y el merge se abortó en vez de resolverse" });
    expect(await limpio()).toBe(true);
  });

  it("si el resolutor falla, o no hay, vuelve atrás", async () => {
    await integrarUna(integracion, uno, null);
    const conError = await integrarUna(integracion, dos, async () => {
      throw new Error("se quedó sin cupo\nmás detalle");
    });
    expect(conError.porQue).toBe("choca en precio.js y no se pudo resolver: se quedó sin cupo");
    expect(await limpio()).toBe(true);
    const sinNadie = await integrarUna(integracion, dos, null);
    expect(sinNadie).toMatchObject({ ok: false, porQue: "choca en precio.js" });
    expect(await limpio()).toBe(true);
  });

  it("el resolutor de siempre le pasa el pedido al agente del equipo en la integración", async () => {
    await integrarUna(integracion, uno, null);
    let pedido = "";
    const agente: Agente = {
      nombre: "prueba",
      async trabajar(universo, tarea) {
        pedido = tarea;
        await writeFile(join(universo.ruta, "precio.js"), "export const precio = 105\n");
        return { forma: { archivos: 1, agregadas: 1, quitadas: 1, dependenciasNuevas: 0 }, gastado: 0.11 };
      },
    };
    const r = await integrarUna(integracion, dos, resolutorConAgente(agente));
    expect(r).toMatchObject({ ok: true, gastado: 0.11 });
    expect(pedido).toContain("Resolvé los conflictos de estos archivos: precio.js.");
    expect(pedido).toContain("«bajar el precio»");
  });
});

describe("las piezas", () => {
  it("encuentra las marcas que quedaron y arma el pedido", async () => {
    await writeFile(join(integracion, "x.js"), "a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> dos\n");
    await writeFile(join(integracion, "y.js"), "// una línea con ======= adentro no es una marca\n");
    expect(await conMarcas(integracion, ["x.js", "y.js", "no-existe.js"])).toEqual(["x.js"]);
    expect(pedidoDeResolver(["a.ts", "b.ts"], "tarea", "rama-x")).toContain("de la rama rama-x que chocó");
  });
});
