import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { TallerDeGit } from "../src/nucleo/taller.js";

/**
 * Muchos universos a la vez sobre el mismo repo: así abre la siembra (todos
 * juntos) y así corre la cola (varias siembras juntas). Cada worktree tiene
 * que quedar sano: un `git worktree prune` de uno no puede pisar el
 * `worktree add` de otro, ni dos ramas pelearse por el lock de git.
 */

const correr = promisify(execFile);

describe("el taller con muchos universos a la vez", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-taller-paralelo-"));
    await writeFile(join(repo, "leeme.txt"), "hola\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
  });

  afterEach(async () => {
    await correr("git", ["worktree", "prune"], { cwd: repo }).catch(() => {});
    await borrarCarpeta(repo);
  });

  it("ocho universos de una siembra y ocho de otra, abiertos juntos, quedan todos sanos", async () => {
    // Dos talleres sobre el mismo repo: dos siembras de la cola a la vez.
    const uno = new TallerDeGit(repo);
    const dos = new TallerDeGit(repo);
    const ids = Array.from({ length: 8 }, (_, i) => `u${i + 1}`);

    const universos = await Promise.all([
      ...ids.map((id) => uno.abrir(id, "dolphin/a")),
      ...ids.map((id) => dos.abrir(id, "dolphin/b")),
    ]);

    // Sano = git lo reconoce como worktree, en su rama, y se puede medir el diff.
    const sanos = await Promise.all(
      universos.map(async (u) => {
        const { stdout } = await correr("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: u.ruta, windowsHide: true });
        await correr("git", ["diff", "--numstat", "HEAD"], { cwd: u.ruta, windowsHide: true });
        return stdout.trim() === u.rama;
      }),
    );
    expect(sanos.filter(Boolean)).toHaveLength(16);
    // Y cada uno con su puerto, también entre las dos siembras.
    expect(new Set(universos.map((u) => u.entorno?.["PORT"])).size).toBe(16);

    await Promise.all(universos.map((u) => (u.rama.startsWith("dolphin/a") ? uno : dos).cerrar(u)));
    const { stdout } = await correr("git", ["worktree", "list"], { cwd: repo, windowsHide: true });
    expect(stdout.trim().split("\n")).toHaveLength(1); // solo queda el principal
  }, 60_000);
});
