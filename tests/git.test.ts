import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { git, gitDice, gitValor } from "../src/nucleo/git.js";

/** El único git de Dolphin (ver git.ts): lo que antes tenía cada copia por su lado, junto. */

describe("el git de Dolphin", () => {
  let repo = "";
  beforeAll(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-git-"));
    await git(["init", "-q"], repo);
  });
  afterAll(async () => {
    await borrarCarpeta(repo);
  });

  it("las rutas con tildes y ñ llegan tal cual, sin escapes octales", async () => {
    await writeFile(join(repo, "facturación-añadida.ts"), "x\n");
    expect(await git(["status", "--porcelain"], repo)).toContain("facturación-añadida.ts");
  });

  it("no pide credenciales ni toma el lock opcional del índice", async () => {
    // Un alias de shell imprime lo que git le pasa a sus hijos.
    const entorno = await git(["-c", "alias.entorno=!echo $GIT_TERMINAL_PROMPT-$GIT_OPTIONAL_LOCKS", "entorno"], repo);
    expect(entorno.trim()).toBe("0-0");
  });

  it("un git que no termina se corta en el tope", async () => {
    // hash-object --stdin espera una entrada estándar que nadie le cierra.
    await expect(git(["hash-object", "--stdin"], repo, { tope: 300 })).rejects.toThrow();
  });

  it("las preguntas de sí o no salen del código de salida, y un valor viene sin el salto final", async () => {
    expect(await gitDice(["rev-parse", "--verify", "--quiet", "refs/heads/no-existe"], repo)).toBe(false);
    expect(await gitValor(["rev-parse", "--is-inside-work-tree"], repo)).toBe("true");
  });
});
