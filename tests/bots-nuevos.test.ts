import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { crearBot, anotarHistorial, guardarHabilidad, leerMemoria, recordarEnBot } from "../src/bots/almacen.js";
import { crearCheckpoint, deshacerCheckpoint } from "../src/bots/checkpoints.js";
import { buscarEnBot } from "../src/bots/memoria.js";
import { pensar, type PedidoDeCorrida } from "../src/bots/pensar.js";
import { correrRutina, type Rutina } from "../src/bots/rutinas.js";
import { instalarServicio, textoUnidad } from "../src/bots/servicio-instalador.js";

const execFile = promisify(execFileCallback);

describe("mejoras de bots", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await borrarCarpeta(dir);
    delete process.env.DOLPHIN_BOTS_DIR;
  });

  async function preparar() {
    dir = await mkdtemp(join(tmpdir(), "dolphin-bots-nuevos-"));
    process.env.DOLPHIN_BOTS_DIR = dir;
  }

  it("el permiso carpeta usa acceptEdits, herramientas, política y checkpoint inyectado", async () => {
    await preparar();
    const bot = await crearBot({ nombre: "Editora", permiso: "carpeta", herramientas: ["Read", "Bash(git status:*)"] });
    let pedido: PedidoDeCorrida | undefined;
    const checkpoint = vi.fn(async () => {});
    await pensar(bot, "editá el informe", { checkpoint, correr: async (p) => { pedido = p; return "hecho"; } });
    expect(checkpoint).toHaveBeenCalledOnce();
    expect(pedido?.args).toEqual(expect.arrayContaining(["--permission-mode", "acceptEdits", "--tools", expect.stringContaining("Read(")]));
    expect(pedido?.args).toContain("Bash(git push:*)");
  });

  it("guarda y restaura un checkpoint git sin mover la rama", async () => {
    await preparar();
    const repo = await mkdtemp(join(tmpdir(), "dolphin-bots-repo-"));
    await execFile("git", ["-C", repo, "init", "-q"]);
    await execFile("git", ["-C", repo, "config", "user.email", "test@example.com"]);
    await execFile("git", ["-C", repo, "config", "user.name", "Dolphin test"]);
    const archivo = join(repo, "nota.txt");
    await writeFile(archivo, "antes\n");
    await execFile("git", ["-C", repo, "add", "nota.txt"]);
    await execFile("git", ["-C", repo, "commit", "-q", "-m", "inicial"]);
    await writeFile(archivo, "checkpoint\n");
    const bot = await crearBot({ nombre: "Git", permiso: "carpeta", carpeta: repo });
    const checkpoint = await crearCheckpoint(bot);
    expect(checkpoint?.stash).toBeTruthy();
    await writeFile(archivo, "del bot\n");
    await deshacerCheckpoint(bot.id);
    expect((await readFile(archivo, "utf8")).replaceAll("\r\n", "\n")).toBe("checkpoint\n");
    await borrarCarpeta(repo);
  });

  it("usa el respaldo solo ante cupo y lo anota como sistema", async () => {
    await preparar();
    const bot = await crearBot({ nombre: "Respaldo", motor: "claude", respaldo: "codex", permiso: "libre" });
    const motores: string[] = [];
    let intento = 0;
    const resultado = await pensar(bot, "hola", {
      correr: async (pedido) => {
        motores.push(pedido.bot.motor);
        intento++;
        if (intento === 1) throw new Error("usage limit reached");
        return "respondió el respaldo";
      },
    });
    expect(motores).toEqual(["claude", "codex"]);
    expect(resultado.texto).toBe("respondió el respaldo");
    await expect(pensar(bot, "otra", { correr: async () => { throw new Error("archivo roto"); } })).rejects.toThrow("archivo roto");
  });

  it("limita la memoria, pide consolidarla y busca también en partes viejas", async () => {
    await preparar();
    const bot = await crearBot({ nombre: "Memoria", permiso: "libre" });
    await recordarEnBot(bot.id, "x".repeat(2_000));
    let primerPrompt = "";
    const respuesta = await pensar(bot, "resumí", {
      correr: async (pedido) => {
        primerPrompt = pedido.prompt;
        return "<<consolidar>>resumen corto<</consolidar>>";
      },
    });
    expect(primerPrompt).toContain("MEMORIA LLENA");
    expect(respuesta.texto).toBe("");
    expect(await leerMemoria(bot.id)).toBe("resumen corto\n");
    await anotarHistorial(bot.id, "vos", "La decisión de arquitectura fue usar colas.", new Date("2026-09-01T00:00:00Z"));
    await mkdir(join(dir, bot.id, "partes"), { recursive: true });
    await writeFile(join(dir, bot.id, "partes", "2026-08-01-parte.md"), "El proveedor elegido fue Delta por su latencia.");
    const resultados = await buscarEnBot(bot.id, "proveedor elegido");
    expect(resultados).toEqual(expect.arrayContaining([expect.objectContaining({ texto: expect.stringContaining("Delta") })]));
  });

  it("carga todas las habilidades fijadas y un chequeo falso no gasta modelo", async () => {
    await preparar();
    const rutina: Rutina = { id: "vigia", cuando: { tipo: "cada", minutos: 5 }, tarea: "revisá", proxima: new Date(0).toISOString(), modelo: "sonnet", vueltas: 2, habilidades: ["una", "dos"], chequeo: "echo" };
    const bot = await crearBot({ nombre: "Rutinas", permiso: "libre", rutinas: [rutina] });
    await guardarHabilidad(bot.id, "una", "Una", "pasos uno");
    await guardarHabilidad(bot.id, "dos", "Dos", "pasos dos");
    const pensarRutina = vi.fn(async () => ({ texto: "no debería", recordo: [], habilidades: [], nada: false }));
    const r = await correrRutina(bot, rutina, {
      ahora: () => new Date("2026-10-28T10:00:00Z"),
      chequear: async () => ({ despertar: false }),
      pensar: pensarRutina,
    });
    expect(r.avisa).toBe(false);
    expect(pensarRutina).not.toHaveBeenCalled();
  });

  it("genera las tres instalaciones sin ejecutar un instalador real", async () => {
    await preparar();
    expect(textoUnidad("win32")).toContain("schtasks");
    expect(textoUnidad("linux")).toContain("WantedBy=default.target");
    expect(textoUnidad("darwin")).toContain("RunAtLoad");
    const home = await mkdtemp(join(tmpdir(), "dolphin-servicio-"));
    const corridas: string[] = [];
    await instalarServicio({ plataforma: "linux", home, ejecutar: async (cmd, args) => { corridas.push([cmd, ...args].join(" ")); } });
    expect(corridas[0]).toContain("systemctl --user enable --now");
    await borrarCarpeta(home);
  });
});
