import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { leerConfig } from "../src/nucleo/config.js";

/** Un solo lector de dolphin.config.json: si falta o está roto, no rompe nada. */
describe("dolphin.config.json", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-config-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("sin archivo, no hay configuración y todo sigue con sus defaults", async () => {
    expect(await leerConfig(repo)).toEqual({});
  });

  it("lee la suscripción, que esconde la plata en todos lados", async () => {
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ suscripcion: true }));
    expect((await leerConfig(repo)).suscripcion).toBe(true);
  });

  it("un archivo roto no tumba a nadie: se ignora", async () => {
    await writeFile(join(repo, "dolphin.config.json"), "{ esto no es json");
    expect(await leerConfig(repo)).toEqual({});
  });
});
