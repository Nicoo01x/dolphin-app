import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { aislarAgentes, comoCorre, correrConPrompt, cortarCorrida, SilencioDelAgente, type Contenedor } from "../src/agentes/ejecutar.js";
import { planDe64 } from "../src/nucleo/caja-filtrada.js";

describe("silencio del agente", () => {
  it("mata un proceso que no escribe y conserva la salida parcial", async () => {
    try {
      await correrConPrompt(
        process.execPath,
        ["-e", "process.stdout.write('inicio'); setTimeout(() => {}, 1000)"],
        "",
        process.cwd(),
        5000,
        undefined,
        false,
        undefined,
        undefined,
        30,
      );
      throw new Error("la corrida tenía que quedar en silencio");
    } catch (error) {
      expect(error).toBeInstanceOf(SilencioDelAgente);
      expect((error as SilencioDelAgente).salidaParcial).toBe("inicio");
    }
  });
});

describe("cortar un agente que corre en una caja", () => {
  const entorno = { ANTHROPIC_API_KEY: "sk-ant", PATH: "C:\\Windows" };

  it("el contenedor lleva nombre, con y sin red filtrada; bubblewrap no tiene contenedor", () => {
    aislarAgentes({ tipo: "docker", config: { imagen: "dolphin-claude" } });
    try {
      const corre = comoCorre("claude", ["-p"], "D:/tmp/wt", entorno);
      expect(corre.contenedor).toMatchObject({ caja: "docker", nombre: expect.stringMatching(/^dolphin-agente-[0-9a-f]{12}$/) });
      expect(corre.args.slice(corre.args.indexOf("--name"), corre.args.indexOf("--name") + 2)).toEqual(["--name", corre.contenedor!.nombre]);
      // Cada corrida el suyo: dos agentes a la vez no se pisan el nombre.
      expect(comoCorre("claude", ["-p"], "D:/tmp/wt", entorno).contenedor!.nombre).not.toBe(corre.contenedor!.nombre);

      aislarAgentes({ tipo: "podman", config: { imagen: "dolphin-claude", red: true } });
      const filtrada = comoCorre("claude", ["-p"], "D:/tmp/wt", entorno);
      expect(filtrada.contenedor?.caja).toBe("podman");
      expect(planDe64(filtrada.args.at(-1)!).nombre).toBe(filtrada.contenedor!.nombre);

      aislarAgentes({ tipo: "bwrap", config: {} });
      expect(comoCorre("claude", ["-p"], "/home/n/wt", entorno).contenedor).toBeUndefined();
    } finally {
      aislarAgentes(null);
    }
  });

  it("mata el árbol y después borra el contenedor, que sin eso seguiría escribiendo en el worktree", async () => {
    const hijo = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { windowsHide: true, detached: process.platform !== "win32" });
    const cerrado = new Promise<void>((listo) => hijo.on("close", () => listo()));
    const quitados: Contenedor[] = [];
    await cortarCorrida(hijo.pid, { caja: "docker", nombre: "dolphin-agente-abc" }, async (c) => void quitados.push(c));
    await cerrado;
    expect(quitados).toEqual([{ caja: "docker", nombre: "dolphin-agente-abc" }]);

    // Sin caja no hay nada que borrar.
    const otro = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { windowsHide: true, detached: process.platform !== "win32" });
    const otroCerrado = new Promise<void>((listo) => otro.on("close", () => listo()));
    await cortarCorrida(otro.pid, undefined, async (c) => void quitados.push(c));
    await otroCerrado;
    expect(quitados).toHaveLength(1);
  });
});
