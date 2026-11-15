import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Adentro de la app de escritorio Dolphin corre como el Electron de la app
 * haciendo de Node (ver electron.ts): la variable que lo permite no puede
 * llegarles a los agentes ni a las fases del portón, y sí a los procesos de
 * Dolphin que se lanzan con el mismo ejecutable.
 */

describe("ELECTRON_RUN_AS_NODE", () => {
  afterEach(() => {
    delete process.env["ELECTRON_RUN_AS_NODE"];
    vi.resetModules();
  });

  it("se saca del entorno al arrancar y vuelve solo en los procesos de Dolphin", async () => {
    process.env["ELECTRON_RUN_AS_NODE"] = "1";
    vi.resetModules();
    const { entornoDeDolphin } = await import("../src/nucleo/electron.js");
    // Lo que hereda cualquier otro: un agente, un `npm test`, la app de la persona.
    expect(process.env["ELECTRON_RUN_AS_NODE"]).toBeUndefined();
    // Lo que lleva una siembra lanzada con process.execPath.
    expect(entornoDeDolphin({ DOLPHIN_X: "y" })).toMatchObject({ ELECTRON_RUN_AS_NODE: "1", DOLPHIN_X: "y" });
  });

  it("con el Node de la terminal no agrega nada", async () => {
    vi.resetModules();
    const { entornoDeDolphin } = await import("../src/nucleo/electron.js");
    expect(entornoDeDolphin()).not.toHaveProperty("ELECTRON_RUN_AS_NODE");
  });
});
