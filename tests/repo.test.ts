import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { revisarRepo } from "../src/nucleo/repo.js";

const correr = promisify(execFile);

describe("revisar el repo antes de sembrar", () => {
  it("una carpeta que no existe se dice en voz humana", async () => {
    const revision = await revisarRepo(join(tmpdir(), "esto-no-existe-dolphin-xyz"));
    expect(revision.sirve).toBe(false);
    expect(revision.porQue).toContain("no existe");
  });

  it("una carpeta sin git explica por qué hace falta", async () => {
    const carpeta = await mkdtemp(join(tmpdir(), "dolphin-sin-git-"));
    try {
      const revision = await revisarRepo(carpeta);
      expect(revision.sirve).toBe(false);
      expect(revision.porQue).toContain("worktrees");
    } finally {
      await borrarCarpeta(carpeta);
    }
  });

  it("un repo sin commits no sirve: los universos salen de HEAD", async () => {
    const carpeta = await mkdtemp(join(tmpdir(), "dolphin-sin-commits-"));
    try {
      await correr("git", ["init", "-q"], { cwd: carpeta });
      const revision = await revisarRepo(carpeta);
      expect(revision.sirve).toBe(false);
      expect(revision.porQue).toContain("commit");
    } finally {
      await borrarCarpeta(carpeta);
    }
  });

  it("un repo con un commit sirve", async () => {
    const carpeta = await mkdtemp(join(tmpdir(), "dolphin-ok-"));
    try {
      await correr("git", ["init", "-q"], { cwd: carpeta });
      await writeFile(join(carpeta, "a.txt"), "hola");
      await correr("git", ["add", "-A"], { cwd: carpeta });
      await correr("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: carpeta });
      expect((await revisarRepo(carpeta)).sirve).toBe(true);
    } finally {
      await borrarCarpeta(carpeta);
    }
  });
});
