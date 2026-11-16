import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { comandoDeDolphin } from "../src/servidor.js";

describe("con qué se lanza un comando de Dolphin", () => {
  let raiz = "";

  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), "dolphin-comando-"));
  });

  afterEach(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  it("en un clon corre el código fuente con tsx", async () => {
    await mkdir(join(raiz, "src"), { recursive: true });
    await writeFile(join(raiz, "src", "cli.ts"), "");
    expect(comandoDeDolphin("cli.ts", raiz)).toEqual(["--import", "tsx", join(raiz, "src", "cli.ts")]);
  });

  it("sin código fuente (la app de escritorio instalada) corre lo construido, sin tsx", () => {
    // Es lo que viaja en el instalador: dist/ y nada de src/. Con tsx, la siembra no arrancaba.
    expect(comandoDeDolphin("cola-cli.ts", raiz)).toEqual([join(raiz, "dist", "cola-cli.js")]);
  });
});
