import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { prepararSiembra, sembrarTarea } from "../src/siembra.js";
import { repartir } from "../src/nucleo/router.js";
import { leerUltimaCosecha } from "../src/nucleo/archivo.js";
import { medirForma } from "../src/nucleo/forma.js";
import type { Agente } from "../src/nucleo/tipos.js";

/**
 * El router de punta a punta: la siembra arma quién escribe, quién corrige
 * y quién revisa según dolphin.config.json, y la cosecha lo deja escrito.
 * Sin llamar a ningún modelo: se mira cómo queda armada.
 */

const correr = promisify(execFile);

describe("el reparto en una siembra", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-reparto-"));
    await writeFile(join(repo, "suma.js"), "export const suma = (a, b) => a + b;\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
  });

  afterEach(async () => {
    await correr("git", ["worktree", "prune"], { cwd: repo }).catch(() => {});
    await borrarCarpeta(repo);
  });

  it("por defecto Sonnet escribe y una revisión con Haiku entra al portón después de lo gratis", async () => {
    const preparada = await prepararSiembra({ repo, tarea: "x", agente: "claude", verificar: ["test"] });
    // Sin cifras propias todavía, una rama sale a medir a Haiku (si la siembra tiene tres o más).
    expect(preparada.reparto).toEqual({ estrategia: "equilibrada", escribir: "sonnet", corregir: "sonnet", revisar: "haiku", explorar: "haiku" });
    expect(preparada.agente.nombre).toContain("claude sonnet");
    expect(preparada.verificadores.map((v) => `${v.nombre}:${v.costo}`)).toEqual(["configuración:gratis", "seguridad:gratis", "test:gratis", "revisión:barato"]);
  });

  it("la estrategia sale de dolphin.config.json, y --estrategia la pisa", async () => {
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ modelos: { estrategia: "calidad" } }));
    expect((await prepararSiembra({ repo, tarea: "x", agente: "claude" })).reparto).toMatchObject({ escribir: "opus", revisar: "sonnet" });

    const economica = await prepararSiembra({ repo, tarea: "x", agente: "claude", estrategia: "economia" });
    expect(economica.reparto).toMatchObject({ escribir: "haiku", revisar: null });
    // Sin revisión con modelo, en el portón quedan solo las fases gratis.
    expect(economica.verificadores.some((v) => v.nombre === "revisión")).toBe(false);
  });

  it("la cosecha guarda qué modelo hizo cada trabajo", async () => {
    // Un agente de prueba que deja un cambio: lo que importa acá es lo que queda escrito.
    const agente: Agente = {
      nombre: "prueba",
      async trabajar(universo) {
        await writeFile(join(universo.ruta, "suma.js"), "export const suma = (a, b) => Number(a) + Number(b);\n");
        return { forma: await medirForma(universo.ruta), gastado: 0, modelo: "claude-opus-5-5" };
      },
    };
    const reparto = repartir("claude", { estrategia: "calidad" });
    await sembrarTarea({ repo, tarea: "endurecer la suma" }, { agente, verificadores: [], reparto });

    const guardada = await leerUltimaCosecha(repo);
    expect(guardada?.modelos).toEqual({ estrategia: "calidad", escribir: "opus", corregir: "opus", revisar: "sonnet" });
    expect(guardada?.candidatos[0]?.modelo).toBe("claude-opus-5-5");
  });
});
