import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { verificadorRevisor } from "../src/agentes/revisor.js";
import { correrEquipo, nombreDeCompanero, type EventoEquipo } from "../src/equipo/equipo.js";
import type { Planificador } from "../src/nucleo/plan.js";

/**
 * El modo equipo de punta a punta, con git y npm de verdad y el agente de mentira: el líder parte
 * la tarea, la cola corre a los compañeros (t3 espera a t1), las ramas entran a una integración,
 * el portón y la revisión corren sobre lo integrado. No gasta nada.
 */

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });

let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-equipo-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(
    join(repo, "package.json"),
    JSON.stringify({ name: "equipo", version: "1.0.0", type: "module", scripts: { sintaxis: "node --check src/a.js" } }),
  );
  await writeFile(join(repo, "src", "a.js"), "export const suma = (a, b) => a + b\n");
  await git(["init", "-q"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});

afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

const lider: Planificador = async () => ({
  texto: JSON.stringify({
    resumen: "lógica, pantalla y tests",
    tareas: [
      { id: "t1", titulo: "la lógica", tarea: "la lógica de fondo", escalon: "medio" },
      { id: "t2", titulo: "la pantalla", tarea: "lo que se ve", escalon: "barato" },
      { id: "t3", titulo: "los tests", tarea: "tests de la lógica", escalon: "barato", dependeDe: "t1" },
    ],
  }),
  gastado: 0,
});

describe("dolphin en modo equipo", () => {
  it("planifica, reparte, integra, revisa y deja una rama lista", async () => {
    const eventos: EventoEquipo[] = [];
    const resultado = await correrEquipo(
      {
        repo,
        objetivo: "exportar a CSV",
        agente: "mentira",
        verificar: ["sintaxis"],
        concurrencia: 2,
        pensar: lider,
        revisor: verificadorRevisor({
          tarea: "exportar a CSV",
          modelo: "demo",
          correr: async () => ({ texto: '{"decision": "aceptar", "porque": "encaja"}', gastado: 0 }),
        }),
      },
      (e) => eventos.push(e),
    );

    expect(resultado.rama).toMatch(/^dolphin-equipo\//);
    expect(eventos.filter((e) => e.tipo === "etapa").map((e) => (e as { etapa: string }).etapa)).toEqual([
      "plan",
      "spawn",
      "work",
      "merge",
      "review",
      "ship",
    ]);
    const plan = eventos.find((e) => e.tipo === "plan");
    expect(plan && plan.tipo === "plan" ? plan.tareas.map((t) => t.id) : []).toEqual(["t1", "t2", "t3"]);
    expect(eventos.filter((e) => e.tipo === "merge" && e.ok)).toHaveLength(3);
    // t3 depende de t1: no arranca antes de que t1 esté lista.
    const indice = (id: string, estado: string) => eventos.findIndex((e) => e.tipo === "tarea" && e.id === id && e.estado === estado);
    expect(indice("t3", "trabajando")).toBeGreaterThan(indice("t1", "lista"));
    // Los compañeros cuentan su trabajo con los eventos de siempre.
    expect(eventos.some((e) => e.tipo === "companero" && e.evento.tipo === "escribio")).toBe(true);
    const revision = eventos.find((e) => e.tipo === "fase-final" && e.verificador === "revisión" && e.estado !== "corre");
    expect(revision && revision.tipo === "fase-final" ? revision.estado : "").toBe("paso");
    // La rama del equipo tiene los tres merges.
    const log = (await git(["log", "--oneline", resultado.rama!], repo)).stdout;
    expect(log.match(/equipo:/g)?.length).toBe(3);
    const worktree = (await git(["worktree", "list", "--porcelain"], repo)).stdout;
    expect(worktree).toContain(`branch refs/heads/${resultado.rama}`);
    expect(worktree).not.toMatch(new RegExp(`branch refs/heads/${resultado.rama}[\\s\\S]*\\nlocked `));
  }, 120_000);

  it("si el líder no arma un plan, lo dice y no siembra nada", async () => {
    const eventos: EventoEquipo[] = [];
    const resultado = await correrEquipo(
      { repo, objetivo: "algo", agente: "mentira", verificar: [], pensar: async () => ({ texto: "no sé", gastado: 0 }), revisor: null },
      (e) => eventos.push(e),
    );
    expect(resultado.rama).toBeUndefined();
    expect(resultado.porQue).toContain("el líder no pudo armar el plan");
    expect(eventos.some((e) => e.tipo === "tarea")).toBe(false);
  });

  it("le pone a cada compañero un nombre por lo que hace", () => {
    expect(nombreDeCompanero(0, "los tests de la exportación")).toBe("tests");
    expect(nombreDeCompanero(1, "el botón de exportar")).toBe("ux");
    expect(nombreDeCompanero(2, "un endpoint nuevo")).toBe("backend");
  });
});
