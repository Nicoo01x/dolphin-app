import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { pasarPorElPorton, type PasadaAMano } from "../src/nucleo/porton-a-mano.js";
import type { ContextoDeVerificacion, Universo, Verificador } from "../src/nucleo/tipos.js";
import type { CorrerRevisor } from "../src/agentes/revisor.js";
import { crearServidor } from "../src/servidor.js";

/**
 * El portón a mano: las fases de una rama sobre la carpeta donde se trabaja,
 * para el estudio de la app de escritorio. El mismo orden y el mismo corte.
 */

let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-porton-"));
});

afterEach(async () => {
  await borrarCarpeta(repo);
});

const fase = (nombre: string, veredicto: { paso: boolean; salteada?: boolean; detalle?: string }, antes?: Promise<unknown>): Verificador => ({
  nombre,
  costo: "gratis",
  async correr() {
    await antes;
    return { detalle: `${nombre}: ${veredicto.paso ? "pasó" : "falló"}`, ...veredicto };
  },
});

describe("el portón a mano", () => {
  it("corre las fases en orden y la primera que falla frena a las que siguen", async () => {
    const pasada = await pasarPorElPorton(repo, {
      verificadores: [
        fase("sintaxis", { paso: true, salteada: true, detalle: "sintaxis: no encontré «node», se salteó" }),
        fase("typecheck", { paso: true }),
        fase("test", { paso: false, detalle: "test: ✖ suma con negativos" }),
        fase("lint", { paso: true }),
      ],
    });
    expect(pasada.fases.map((f) => [f.nombre, f.estado])).toEqual([
      ["sintaxis", "salteada"],
      ["typecheck", "paso"],
      ["test", "fallo"],
      ["lint", "esperando"],
    ]);
    expect(pasada.fases[2]!.detalle).toBe("test: ✖ suma con negativos");
    expect(pasada.fases[2]!.ms).toBeGreaterThanOrEqual(0);
    expect(pasada.hasta).toBeDefined();
  });

  it("cuenta cada fase cuando arranca y cuando termina", async () => {
    const vistas: PasadaAMano[] = [];
    await pasarPorElPorton(repo, {
      verificadores: [fase("typecheck", { paso: true }), fase("test", { paso: true })],
      alCambiar: (p) => vistas.push(p),
    });
    expect(vistas.map((v) => v.fases.map((f) => f.estado).join(","))).toEqual([
      "esperando,esperando",
      "corriendo,esperando",
      "paso,corriendo",
      "paso,paso",
    ]);
    expect(vistas.slice(0, -1).every((v) => v.hasta === undefined)).toBe(true);
    expect(vistas.at(-1)!.hasta).toBeDefined();
  });

  it("una fase que explota es una fase que falló, con su porqué", async () => {
    const rota: Verificador = { nombre: "test", costo: "gratis", correr: () => Promise.reject(new Error("sin memoria")) };
    const pasada = await pasarPorElPorton(repo, { verificadores: [rota] });
    expect(pasada.fases[0]).toMatchObject({ estado: "fallo", detalle: "test: se rompió (sin memoria)" });
  });

  it("la revisión cruzada va última, solo si lo gratis pasó, y sabe quién escribió", async () => {
    const vistos: { universo: Universo; contexto?: ContextoDeVerificacion }[] = [];
    const revisor: Verificador = {
      nombre: "revisión",
      costo: "barato",
      async correr(universo, contexto) {
        vistos.push({ universo, ...(contexto ? { contexto } : {}) });
        return { paso: false, detalle: "revisión: hace de más, toca el login" };
      },
    };
    const pasada = await pasarPorElPorton(repo, {
      verificadores: [fase("typecheck", { paso: true })],
      revision: { verificador: revisor, escribio: "claude-sonnet-5-5", base: "main" },
    });
    expect(pasada.fases.map((f) => [f.nombre, f.estado])).toEqual([
      ["typecheck", "paso"],
      ["revisión", "fallo"],
    ]);
    expect(pasada.fases[1]!.detalle).toBe("revisión: hace de más, toca el login");
    expect(vistos[0]!.contexto).toEqual({ modelo: "claude-sonnet-5-5" });
    expect(vistos[0]!.universo.base).toBe("main");

    vistos.length = 0;
    const cortada = await pasarPorElPorton(repo, {
      verificadores: [fase("test", { paso: false })],
      revision: { verificador: revisor },
    });
    expect(cortada.fases.map((f) => f.estado)).toEqual(["fallo", "esperando"]);
    expect(vistos).toEqual([]);
  });

  it("sin fases inyectadas, las del package.json de la carpeta, sin las que construyen", async () => {
    await writeFile(
      join(repo, "package.json"),
      JSON.stringify({
        scripts: {
          typecheck: "node -e \"process.exit(0)\"",
          test: "node -e \"console.error('✖ suma con negativos'); process.exit(1)\"",
          build: "node -e \"process.exit(1)\"",
        },
      }),
    );
    const pasada = await pasarPorElPorton(repo);
    expect(pasada.fases.map((f) => [f.nombre, f.estado])).toEqual([
      ["typecheck", "paso"],
      ["test", "fallo"],
    ]);
    expect(pasada.fases[1]!.detalle).toContain("✖ suma con negativos");
  }, 60_000);
});

describe("el portón a mano desde la consola", () => {
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";
  let soltar: () => void = () => {};

  beforeEach(async () => {
    const espera = new Promise<void>((listo) => (soltar = listo));
    servidor = crearServidor({
      repo,
      calendario: false,
      verificadoresAMano: [fase("typecheck", { paso: true }), fase("test", { paso: false, detalle: "test: ✖ suma" }, espera)],
    });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    soltar();
    await new Promise((listo) => servidor.close(listo));
  });

  const pedir = (token?: string) =>
    fetch(`${base}/api/porton`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-dolphin-token": token } : {}) },
      body: "{}",
    });

  it("arranca con el pase, no se pisa con otra y deja la pasada para preguntarla", async () => {
    expect(await (await fetch(`${base}/api/porton`)).json()).toEqual({ corriendo: false, pasada: null });
    expect((await pedir()).status).toBe(403);

    const pagina = await (await fetch(`${base}/`)).text();
    const token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(pagina)?.[1];
    if (!token) return; // sin la consola construida no hay pase

    expect((await pedir(token)).status).toBe(202);
    // Mientras «test» espera, una segunda pasada no arranca.
    const otra = await pedir(token);
    expect(otra.status).toBe(409);
    expect(await otra.json()).toMatchObject({ porQue: "ya está pasando por el portón" });

    soltar();
    let estado: { corriendo: boolean; pasada: PasadaAMano | null } = { corriendo: true, pasada: null };
    await esperarA(async () => {
      estado = await (await fetch(`${base}/api/porton`)).json();
      return !estado.corriendo;
    }, { tope: 10_000, paso: 20 });
    expect(estado.corriendo).toBe(false);
    expect(estado.pasada?.fases.map((f) => [f.nombre, f.estado])).toEqual([
      ["typecheck", "paso"],
      ["test", "fallo"],
    ]);
  });
});

describe("la revisión cruzada desde la consola", () => {
  let servidor: ReturnType<typeof crearServidor>;
  let base = "";
  const preguntas: { prompt: string; modelo: string }[] = [];
  let contesta = '{"decision": "aceptar", "porque": "hace lo que pide"}';

  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });

  beforeEach(async () => {
    preguntas.length = 0;
    git("init", "-q");
    git("config", "user.email", "test@dolphin.local");
    git("config", "user.name", "test");
    await writeFile(join(repo, "suma.js"), "export const suma = (a, b) => a + b;\n");
    git("add", ".");
    git("commit", "-q", "-m", "inicio");
    await writeFile(join(repo, "suma.js"), "export const suma = (a, b) => a - b;\n");
    const correrRevisor: CorrerRevisor = async (prompt, _universo, modelo) => {
      preguntas.push({ prompt, modelo });
      return { texto: contesta, gastado: 0.01 };
    };
    servidor = crearServidor({ repo, calendario: false, verificadoresAMano: [fase("typecheck", { paso: true })], correrRevisor });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise((listo) => servidor.close(listo));
  });

  async function pasar(cuerpo: Record<string, unknown>): Promise<PasadaAMano | null | undefined> {
    const pagina = await (await fetch(`${base}/`)).text();
    const token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(pagina)?.[1];
    if (!token) return undefined; // sin la consola construida no hay pase
    const r = await fetch(`${base}/api/porton`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dolphin-token": token },
      body: JSON.stringify(cuerpo),
    });
    expect(r.status).toBe(202);
    let estado: { corriendo: boolean; pasada: PasadaAMano | null } = { corriendo: true, pasada: null };
    await esperarA(async () => {
      estado = await (await fetch(`${base}/api/porton`)).json();
      return !estado.corriendo;
    }, { tope: 10_000, paso: 20 });
    return estado.pasada;
  }

  it("con la tarea, otro modelo lee el diff y su «cortar» frena el portón", async () => {
    contesta = '{"decision": "cortar", "porque": "la suma ahora resta"}';
    const pasada = await pasar({ tarea: "Que suma acepte negativos", escribio: "claude-haiku-5-5" });
    if (pasada === undefined) return;
    expect(pasada?.fases.map((f) => [f.nombre, f.estado])).toEqual([
      ["typecheck", "paso"],
      ["revisión", "fallo"],
    ]);
    expect(pasada?.fases[1]!.detalle).toBe("revisión: la suma ahora resta");
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]!.prompt).toContain("Que suma acepte negativos");
    expect(preguntas[0]!.prompt).toContain("a - b");
    // Revisa otro: nunca el mismo modelo que escribió.
    expect(preguntas[0]!.modelo).not.toBe("claude-haiku-5-5");
  });

  it("sin tarea, o con la revisión apagada en la config, no se le pregunta a nadie", async () => {
    const sinTarea = await pasar({});
    if (sinTarea === undefined) return;
    expect(sinTarea?.fases.map((f) => f.nombre)).toEqual(["typecheck"]);

    await mkdir(join(repo, ".dolphin"), { recursive: true });
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ modelos: { revisar: false } }));
    const apagada = await pasar({ tarea: "Que suma acepte negativos" });
    expect(apagada?.fases.map((f) => f.nombre)).toEqual(["typecheck"]);
    expect(preguntas).toEqual([]);
  });
});
