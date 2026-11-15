import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import {
  POLITICA_POR_DEFECTO,
  globARegex,
  leerPolitica,
  verificadorDePolitica,
  violaciones,
} from "../src/nucleo/politica.js";

/**
 * Lo que corre solo puede escribir en su rama, pero no deploya, no toca
 * migraciones ni secretos. Si igual lo escribe, el portón corta la rama.
 */

const correr = promisify(execFile);

describe("los globs de la política", () => {
  it("** cruza carpetas, también ninguna", () => {
    expect(globARegex("**/migrations/**").test("prisma/migrations/2026_x/migration.sql")).toBe(true);
    expect(globARegex("**/migrations/**").test("migrations/001.sql")).toBe(true);
    expect(globARegex("**/migrations/**").test("src/migracion.ts")).toBe(false);
  });

  it("* no cruza carpetas y {a,b} es una alternativa", () => {
    const deploy = globARegex("**/deploy*.{sh,yml}");
    expect(deploy.test("deploy.sh")).toBe(true);
    expect(deploy.test("scripts/deploy-prod.yml")).toBe(true);
    expect(deploy.test("docs/DEPLOY.md")).toBe(false);
    expect(globARegex("src/*.ts").test("src/a/b.ts")).toBe(false);
  });
});

describe("la política por defecto", () => {
  it("atrapa migraciones, pipelines de deploy y secretos", () => {
    const encontradas = violaciones(
      [
        "prisma/migrations/20261021_x/migration.sql",
        ".github/workflows/deploy.yml",
        "scripts/deploy.sh",
        ".env",
        "src/app.ts",
        "web/DEPLOY.md",
      ],
      POLITICA_POR_DEFECTO,
    );
    expect(encontradas.map((e) => e.archivo)).toEqual([
      "prisma/migrations/20261021_x/migration.sql",
      ".github/workflows/deploy.yml",
      "scripts/deploy.sh",
      ".env",
    ]);
  });

  it("le prohíbe al agente empujar, commitear, publicar y migrar", () => {
    const comandos = POLITICA_POR_DEFECTO.comandosProhibidos.join(" ");
    for (const c of ["git push", "git commit", "npm publish", "prisma migrate", "ssh"]) {
      expect(comandos).toContain(c);
    }
  });
});

describe("la política en el portón", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-politica-"));
    await writeFile(join(repo, "app.ts"), "export const a = 1;\n");
    await correr("git", ["init", "-q"], { cwd: repo });
    await correr("git", ["add", "-A"], { cwd: repo });
    await correr("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base"], { cwd: repo });
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  const universo = () => ({ id: "u1", rama: "dolphin/u1", ruta: repo, nacido: 0 });

  it("una rama que agrega una migración NUEVA se corta, con el motivo", async () => {
    await mkdir(join(repo, "prisma", "migrations", "20261021_cupo"), { recursive: true });
    await writeFile(join(repo, "prisma", "migrations", "20261021_cupo", "migration.sql"), "ALTER TABLE x;\n");
    await writeFile(join(repo, "app.ts"), "export const a = 2;\n");

    const veredicto = await verificadorDePolitica(POLITICA_POR_DEFECTO).correr(universo());
    expect(veredicto.paso).toBe(false);
    expect(veredicto.detalle).toContain("prisma/migrations/20261021_cupo/migration.sql");
    expect(veredicto.detalle).toContain("no toca migraciones");
  });

  it("lo permitido pasa", async () => {
    await writeFile(join(repo, "app.ts"), "export const a = 3;\n");
    await writeFile(join(repo, "nuevo.ts"), "export const b = 1;\n");
    const veredicto = await verificadorDePolitica(POLITICA_POR_DEFECTO).correr(universo());
    expect(veredicto.paso).toBe(true);
  });

  it("dolphin.config.json del repo reemplaza la política campo por campo", async () => {
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ politica: { archivosProhibidos: ["legacy/**"] } }));
    const politica = await leerPolitica(repo);
    expect(politica.archivosProhibidos).toEqual(["legacy/**"]);
    expect(politica.comandosProhibidos).toEqual(POLITICA_POR_DEFECTO.comandosProhibidos);
  });

  it("sin config, la política es la de por defecto", async () => {
    expect(await leerPolitica(repo)).toEqual(POLITICA_POR_DEFECTO);
  });
});
