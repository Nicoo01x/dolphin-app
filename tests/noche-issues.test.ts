import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { correrNoche, issuesParaLaNoche, pendientesDeIssues, type IssueDeLaNoche } from "../src/noche.js";
import type { Cosecha } from "../src/nucleo/tipos.js";
import type { PreguntarAGh } from "../src/nucleo/vista-git.js";

let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-issues-"));
});

afterEach(async () => {
  await borrarCarpeta(repo);
});

const issue = (numero: number, autor: string, creado: string): IssueDeLaNoche => ({
  numero,
  titulo: `Tarea ${numero}`,
  cuerpo: "Resolverla.",
  autor,
  creado,
  url: `https://github.com/nico/tienda/issues/${numero}`,
});

const cosecha = (rama = "dolphin/issue/u1"): Cosecha => {
  const universo = { id: "u1", rama, ruta: join(repo, "worktree"), nacido: 0 };
  const ganador = { universo, vivo: true, pasadas: [{ verificador: "spec", costo: "gratis" as const, paso: true, detalle: "spec: pasó", gastado: 0, ms: 1 }] };
  return { tarea: "Resolver issue", candidatos: [ganador], ganador, porQueGano: "pasó", gastado: 0, muertosGratis: 0, ms: 1, entregada: { rama, commit: "abc", base: "base" } };
};

describe("issues de la noche", () => {
  it("ordena los de quien tiene la sesión de gh y manda los ajenos a la Bandeja", async () => {
    const gh: PreguntarAGh = async (_repo, args) => {
      // En un repo de una organización el dueño es la organización: lo que vale es el usuario logueado.
      if (args[0] === "repo") return JSON.stringify({ owner: { login: "mi-organizacion" } });
      if (args.join(" ") === "api user --jq .login") return "nico\n";
      return JSON.stringify([
        { number: 2, title: "Dos", body: "b", author: { login: "ana" }, createdAt: "2026-10-28T10:00:00Z", url: "u2" },
        { number: 1, title: "Uno", body: "a", author: { login: "nico" }, createdAt: "2026-10-27T10:00:00Z", url: "u1" },
      ]);
    };
    const resultado = await issuesParaLaNoche(repo, "dolphin", gh);
    expect(resultado).toMatchObject({ disponible: true, propios: [{ numero: 1 }], ajenos: [{ numero: 2 }] });
    expect((await readFile(join(repo, ".dolphin", "bandeja.json"), "utf8"))).toContain("Issue #2");
    expect(pendientesDeIssues([issue(1, "nico", "2026-10-27")])[0]!.tarea).toContain("(issue:");
  });

  it("abre o actualiza el draft y comenta el enlace al terminar", async () => {
    const vistos: string[] = [];
    const propia = issue(7, "nico", "2026-10-27T10:00:00Z");
    const noche = await correrNoche(
      { repo, agente: "mentira", hasta: new Date(Date.now() + 60_000), pendientes: pendientesDeIssues([propia]) },
      {
        issueAbierto: async () => true,
        sembrar: async () => cosecha(),
        abrirPr: async () => ({ ok: true, url: "https://github.com/nico/tienda/pull/8" }),
        comentarIssue: async (_repo, numero, pr) => {
          vistos.push(`${numero}:${pr}`);
        },
      },
    );
    expect(noche.tareas[0]).toMatchObject({ estado: "lista", pr: "https://github.com/nico/tienda/pull/8" });
    expect(vistos).toEqual(["7:https://github.com/nico/tienda/pull/8"]);
  });

  it("si gh falla, la noche sigue: el issue cuenta como abierto y no se pierde la cosecha", async () => {
    const sembradas: string[] = [];
    const noche = await correrNoche(
      { repo, agente: "mentira", hasta: new Date(Date.now() + 60_000), pendientes: pendientesDeIssues([issue(4, "nico", "2026-10-27"), issue(5, "nico", "2026-10-28")]) },
      {
        issueAbierto: async () => {
          throw new Error("gh: could not resolve host api.github.com");
        },
        sembrar: async (pedido) => {
          sembradas.push(pedido.tarea);
          return cosecha();
        },
        abrirPr: async () => {
          throw new Error("gh: sin red");
        },
      },
    );
    expect(sembradas).toHaveLength(2);
    expect(noche.tareas.map((t) => t.estado)).toEqual(["lista", "lista"]);
    expect(noche.tareas[0]).toMatchObject({ rama: "dolphin/issue/u1", commit: "abc", porQue: expect.stringContaining("no se pudo abrir el PR: gh: sin red") });
    expect(noche.termino).toBeDefined();
  });

  it("no publica una rama si el issue se cerró mientras corría", async () => {
    let consultas = 0;
    let publicados = 0;
    const noche = await correrNoche(
      { repo, agente: "mentira", hasta: new Date(Date.now() + 60_000), pendientes: pendientesDeIssues([issue(9, "nico", "2026-10-27")]) },
      {
        issueAbierto: async () => consultas++ === 0,
        sembrar: async () => cosecha(),
        abrirPr: async () => {
          publicados += 1;
          return { ok: true, url: "u" };
        },
      },
    );
    expect(noche.tareas[0]).toMatchObject({ estado: "no-salio", porQue: expect.stringContaining("se cerró") });
    expect(publicados).toBe(0);
  });
});
