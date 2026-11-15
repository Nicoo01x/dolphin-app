import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { volverAlTurnoEnElEquipo } from "../src/equipo/equipo.js";
import { guardarTurno, olvidarTurnos, turnosDe, volverAlTurno } from "../src/nucleo/turnos.js";
import { prepararSiembra, sembrarTarea } from "../src/siembra.js";

/** Los turnos de cada agente, guardados en git, y la vuelta a cualquiera de ellos. Con git de verdad. */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();
let repo = "";
const extras: string[] = [];
/** Lo que hay en el archivo, con los finales de línea de git en Windows (core.autocrlf) llevados a \n. */
const leer = async (ruta: string) => (await readFile(ruta, "utf8")).replace(/\r\n/g, "\n");

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-turnos-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module", scripts: { sintaxis: "node --check src/a.js" } }));
  await writeFile(join(repo, "src", "a.js"), "export const precio = 100\n");
  await git(["init", "-q", "-b", "main"], repo);
  await git(["config", "user.email", "n@n"], repo);
  await git(["config", "user.name", "n"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});
afterEach(async () => {
  for (const r of extras.splice(0)) await git(["worktree", "remove", "--force", r], repo).catch(() => {});
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

/** Un compañero en su worktree: escribe (turno 1), corrige (turno 2) y entrega con un commit. */
async function companeroConDosTurnos(rama: string): Promise<string> {
  const wt = `${repo}-${rama.replace(/\W/g, "-")}`;
  extras.push(wt);
  await git(["worktree", "add", "-q", "-b", rama, wt], repo);
  await writeFile(join(wt, "src", "a.js"), "export const precio = 120\n");
  await guardarTurno(wt, rama, 1, "escribió");
  await writeFile(join(wt, "src", "a.js"), "export const precio = 120\nexport const descuento = 10\n");
  await writeFile(join(wt, "src", "b.js"), "export const b = 1\n");
  await guardarTurno(wt, rama, 2, "corrigió test");
  await git(["add", "-A"], wt);
  await git(["commit", "-qm", "entrega"], wt);
  return wt;
}

describe("los turnos de una rama", () => {
  it("cada turno queda en git con lo que cambió, sin mover la rama", async () => {
    const wt = await companeroConDosTurnos("dolphin/x/u1");
    const turnos = await turnosDe(repo, "dolphin/x/u1");
    expect(turnos.map((t) => [t.n, t.que, t.agregadas, t.quitadas])).toEqual([
      [1, "escribió", 1, 1],
      [2, "corrigió test", 2, 0],
    ]);
    // La rama es la de la entrega: guardar turnos no la movió.
    expect(await git(["log", "--format=%s", "-1", "dolphin/x/u1"], repo)).toBe("entrega");
    expect(await readFile(join(wt, "src", "a.js"), "utf8")).toContain("descuento");
  });

  it("volver a un turno suma un commit con ese árbol (la carpeta queda igual) y no pierde nada", async () => {
    const wt = await companeroConDosTurnos("dolphin/x/u1");
    const puntaAntes = await git(["rev-parse", "dolphin/x/u1"], repo);
    const r = await volverAlTurno(repo, "dolphin/x/u1", 1);
    expect(r).toMatchObject({ ok: true, porQue: "dolphin/x/u1 volvió al turno 1 (escribió)" });
    expect(await leer(join(wt, "src", "a.js"))).toBe("export const precio = 120\n");
    await expect(readFile(join(wt, "src", "b.js"), "utf8")).rejects.toThrow();
    expect(await git(["log", "--format=%s", "-1", "dolphin/x/u1"], repo)).toBe("vuelve al turno 1: escribió");
    expect(await git(["rev-parse", "dolphin/x/u1^"], repo)).toBe(puntaAntes);
    // Para adelante también: el turno 2 sigue ahí.
    expect((await volverAlTurno(repo, "dolphin/x/u1", 2)).ok).toBe(true);
    expect(await leer(join(wt, "src", "b.js"))).toBe("export const b = 1\n");
    expect(await volverAlTurno(repo, "dolphin/x/u1", 2)).toMatchObject({ ok: false, porQue: "la rama ya está como en el turno 2" });
    expect(await volverAlTurno(repo, "dolphin/x/u1", 9)).toMatchObject({ ok: false, porQue: "la rama dolphin/x/u1 no tiene un turno 9" });
  });

  it("olvidar los turnos de una rama que se fue no deja refs colgadas", async () => {
    await companeroConDosTurnos("dolphin/x/u1");
    await olvidarTurnos(repo, "dolphin/x/u1");
    expect(await turnosDe(repo, "dolphin/x/u1")).toEqual([]);
    expect(await git(["for-each-ref", "refs/dolphin/turnos/"], repo)).toBe("");
  });
});

describe("los turnos en una siembra", () => {
  it("la rama elegida guarda su turno al escribir; las que se tiran se llevan los suyos", async () => {
    const pedido = { repo, tarea: "exportar a CSV", agente: "mentira" as const, verificar: ["sintaxis"] };
    const { cosecha } = await sembrarTarea(pedido, await prepararSiembra(pedido), { cantidad: 2 });
    const ganadora = cosecha.ganador!.universo.rama;
    expect((await turnosDe(repo, ganadora)).map((t) => [t.n, t.que])).toEqual([[1, "escribió"]]);
    const todas = (await git(["for-each-ref", "--format=%(refname)", "refs/dolphin/turnos/"], repo)).split("\n").filter(Boolean);
    expect(todas.every((r) => r.includes(ganadora))).toBe(true);
  }, 60_000);
});

describe("volver a un turno dentro del equipo", () => {
  it("la integración queda con el compañero en su turno 1, sin tocar lo del otro, y el portón vuelve a correr", async () => {
    await companeroConDosTurnos("dolphin/x/u1");
    // El otro compañero: un archivo suyo.
    const otro = `${repo}-otro`;
    extras.push(otro);
    await git(["worktree", "add", "-q", "-b", "dolphin/y/u1", otro], repo);
    await writeFile(join(otro, "src", "c.js"), "export const c = 1\n");
    await git(["add", "-A"], otro);
    await git(["commit", "-qm", "lo del otro"], otro);
    // La integración: los dos adentro.
    const integracion = `${repo}-integracion`;
    extras.push(integracion);
    await git(["worktree", "add", "-q", "-b", "dolphin-equipo/z", integracion], repo);
    await git(["merge", "--no-ff", "-q", "-m", "equipo: t1", "dolphin/x/u1"], integracion);
    await git(["merge", "--no-ff", "-q", "-m", "equipo: t2", "dolphin/y/u1"], integracion);

    const eventos: string[] = [];
    const r = await volverAlTurnoEnElEquipo({ repo, ruta: integracion, id: "t1", rama: "dolphin/x/u1", n: 1, agente: "mentira", verificar: ["sintaxis"] }, (e) => eventos.push(e.tipo === "fase-final" ? `${e.verificador}:${e.estado}` : e.tipo));
    expect(r).toMatchObject({ ok: true });
    expect(await leer(join(integracion, "src", "a.js"))).toBe("export const precio = 120\n");
    await expect(readFile(join(integracion, "src", "b.js"), "utf8")).rejects.toThrow();
    expect(await leer(join(integracion, "src", "c.js"))).toBe("export const c = 1\n");
    expect(eventos).toContain("merge");
    expect(eventos).toContain("sintaxis:paso");
  }, 60_000);
});
