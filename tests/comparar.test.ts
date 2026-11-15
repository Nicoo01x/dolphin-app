import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { comparar, htmlDeComparacion, textoDeComparacion, ultimaComparacion } from "../src/comparar.js";
import type { Cosecha } from "../src/nucleo/tipos.js";
import { Sesion } from "../src/tui/sesion.js";

/**
 * Elegir mirando: la misma tarea a varios motores, la página lado a lado y /elegir que mergea una y
 * tira las otras. Con motores simulados, y de punta a punta con git de verdad y el agente de mentira.
 */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();
let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-comparar-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module", scripts: { sintaxis: "node --check src/a.js" } }));
  await writeFile(join(repo, "src", "a.js"), "export const suma = (a, b) => a + b\n");
  await writeFile(join(repo, ".gitignore"), ".dolphin/\n");
  await git(["init", "-q", "-b", "main"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});
afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await borrarCarpeta(repo);
});

const ganador = (motor: string, conVideo: boolean): Cosecha =>
  ({
    tarea: "buscador",
    candidatos: [],
    ganador: {
      universo: { id: "u1", rama: `dolphin/${motor}/u1`, ruta: `/tmp/${motor}`, nacido: 0 },
      vivo: true,
      forma: { archivos: 2, agregadas: 40, quitadas: 3, dependenciasNuevas: 0 },
      pasadas: [{ verificador: "pantalla", paso: true, ms: 1, detalle: "", ...(conVideo ? { videos: [`u1-anda-${motor}.webm`] } : {}) }],
    },
    porQueGano: "pasó el portón",
    gastado: 0.3,
    muertosGratis: 0,
    ms: 1,
  }) as unknown as Cosecha;

describe("comparar motores", () => {
  it("uno por motor, a la vez; el que no está instalado no frena a los otros", async () => {
    const c = await comparar(
      { repo, tarea: "un buscador en la lista de pedidos", motores: ["claude", "codex", "antigravity"] },
      {
        sembrar: async ({ agente }) => {
          if (agente === "antigravity") throw new Error("no encontré «agy»: instalalo\nmás");
          return ganador(agente!, agente === "claude");
        },
      },
    );
    expect(c.contendientes.map((x) => [x.motor, x.estado])).toEqual([
      ["claude", "lista"],
      ["codex", "lista"],
      ["antigravity", "no-salio"],
    ]);
    expect(textoDeComparacion(c)).toBe(
      [
        "«un buscador en la lista de pedidos» con 3 motores: 2 pasaron el portón.",
        "",
        "1. claude · pasó el portón · 2 archivo(s), +40 −3 · con video · US$ 0.30",
        "2. codex · pasó el portón · 2 archivo(s), +40 −3 · US$ 0.30",
        "3. antigravity · no salió: no encontré «agy»: instalalo",
        "",
        "Mirá las apps lado a lado en la página y elegí: /elegir 2 mergea esa y tira las otras.",
      ].join("\n"),
    );
    const pagina = htmlDeComparacion(c);
    expect(pagina.match(/<section class="columna/g)).toHaveLength(3);
    expect(pagina).toContain('<video src="../videos/u1-anda-claude.webm" controls muted autoplay loop');
    expect(pagina).toContain("Sin video: configurá pantalla en dolphin.config.json");
    expect(await readFile(join(repo, ".dolphin", "comparar", `${c.id}.html`), "utf8")).toBe(pagina);
  });

  it("de punta a punta: /comparar, /elegir mergea esa en tu rama y tira las otras", async () => {
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] });
    await sesion.recibir("/comparar exportar los pedidos a CSV");
    const resumen = sesion.mensajes.at(-1)!.texto;
    expect(resumen).toMatch(/^«exportar los pedidos a CSV» con 3 motores: 3 pasaron el portón\./);
    expect(resumen).toContain(".dolphin/comparar/");
    const ramas = (await git(["branch", "--list", "dolphin/*"], repo)).split("\n").map((r) => r.replace(/^[*+ ]+/, "").trim()).filter(Boolean);
    expect(ramas).toHaveLength(3);

    const antes = await git(["rev-parse", "HEAD"], repo);
    await sesion.recibir("/elegir 2");
    expect(sesion.mensajes.at(-1)!.texto).toBe("Mergeé la de mentira y tiré las otras.");
    expect(await git(["rev-parse", "HEAD"], repo)).not.toBe(antes);
    // La elegida entró a main (y su rama se limpió, como en la consola); las otras se tiraron.
    const elegida = (await ultimaComparacion(repo))!.contendientes[1]!;
    expect(await git(["merge-base", "--is-ancestor", elegida.commit!, "HEAD"], repo)).toBe("");
    expect(await git(["branch", "--list", "dolphin/*"], repo)).toBe("");
    await sesion.recibir("/elegir 1");
    expect(sesion.mensajes.at(-1)!.texto).toBe("No pude: ya elegiste la 2.");
    sesion.cerrar();
  }, 120_000);
});
