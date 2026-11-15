import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rename, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { cambiosDe } from "../src/nucleo/cambios.js";
import { medirForma } from "../src/nucleo/forma.js";
import { archivosTocados } from "../src/nucleo/politica.js";
import { testsCambiados } from "../src/nucleo/tests-intactos.js";
import { entregadorDeGit } from "../src/nucleo/entrega.js";
import { TallerDeGit } from "../src/nucleo/taller.js";
import { leerDiff } from "../src/nucleo/diff.js";
import { medirLineaBase } from "../src/nucleo/linea-base.js";
import type { Verificador } from "../src/nucleo/tipos.js";

/**
 * Qué cambió una rama, con git de verdad: lo que Dolphin le agregó al
 * worktree no es de la rama, las rutas llegan tal cual, un renombre se ve,
 * la base es la de la rama y nada de esto le toca nada al repo.
 */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();

describe("lo que cambió una rama", () => {
  let repo = "";
  let carpeta = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-cambios-"));
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-cambios-wt-"));
    await git(["init", "-q"], repo);
    await git(["config", "user.email", "nico@ejemplo.com"], repo);
    await git(["config", "user.name", "Nico"], repo);
    await writeFile(join(repo, "a.js"), "export const a = 1;\n");
    await mkdir(join(repo, "tests"));
    await writeFile(join(repo, "tests", "suma.test.js"), "test('uno', () => {});\ntest('dos', () => {});\ntest('tres', () => {});\n");
    // Un repo que NO ignora su .env (Create React App no lo ignora): el caso que terminaba en el commit.
    await writeFile(join(repo, ".gitignore"), "node_modules/\n");
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "base"], repo);
    await writeFile(join(repo, ".env"), "CLAVE=secreta\n");
    await mkdir(join(repo, "node_modules", "dep"), { recursive: true });
    await writeFile(join(repo, "node_modules", "dep", "index.js"), "module.exports = 1;\n");
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
    await borrarCarpeta(carpeta);
  });

  it("el .env copiado y el enlace a node_modules no son de la rama: ni se miden, ni se cortan, ni se commitean", async () => {
    const taller = new TallerDeGit(repo, carpeta);
    const u = await taller.abrir("u1", "dolphin/x");
    try {
      // Antes de que el agente toque nada: ningún cambio (antes contaba 1, el .env).
      expect(await cambiosDe(u.ruta)).toEqual([]);
      expect((await medirForma(u.ruta)).archivos).toBe(0);

      await writeFile(join(u.ruta, "a.js"), "export const a = 2;\n");
      expect(await archivosTocados(u.ruta)).toEqual(["a.js"]); // la política no ve «tocó .env»

      const commit = await entregadorDeGit(repo).commitear(u.ruta, "dolphin: subí a");
      const enElCommit = (await git(["show", "--name-only", "--format=", commit], repo)).split("\n").filter(Boolean);
      expect(enElCommit).toEqual(["a.js"]);
    } finally {
      await taller.cerrar(u);
    }
    // Y el node_modules del repo sigue entero después de cerrar.
    expect((await git(["status", "--porcelain", "--ignored"], repo)).includes("node_modules")).toBe(true);
  });

  it("una ruta con ñ llega tal cual, y un test renombrado al que le sacaron casos cuenta", async () => {
    const taller = new TallerDeGit(repo, carpeta);
    const u = await taller.abrir("u1", "dolphin/x");
    try {
      await mkdir(join(u.ruta, "migrations"));
      await writeFile(join(u.ruta, "migrations", "001_añadir.sql"), "create table x();\n");
      await rename(join(u.ruta, "tests", "suma.test.js"), join(u.ruta, "tests", "suma.spec.js"));
      await writeFile(join(u.ruta, "tests", "suma.spec.js"), "test('uno', () => {});\n");
      expect(await archivosTocados(u.ruta)).toContain("migrations/001_añadir.sql");
      expect(await testsCambiados(u.ruta)).toEqual([{ ruta: "tests/suma.test.js", quitadas: 3, borrado: true }]);
    } finally {
      await taller.cerrar(u);
    }
  });

  it("el diff de una rama sembrada encima de otra ya entregada muestra solo lo suyo", async () => {
    // La primera, entregada: su commit dice «dolphin: …».
    const taller = new TallerDeGit(repo, carpeta);
    const primera = await taller.abrir("u1", "dolphin/a");
    await writeFile(join(primera.ruta, "a.js"), "export const a = 2;\n");
    const commit = await entregadorDeGit(repo).commitear(primera.ruta, "dolphin: subí a");
    // La segunda nace de ese commit y no está entregada todavía.
    const encima = new TallerDeGit(repo, await mkdtemp(join(tmpdir(), "dolphin-encima-")), commit);
    const segunda = await encima.abrir("u2", "dolphin/b");
    try {
      await writeFile(join(segunda.ruta, "b.js"), "export const b = 1;\n");
      const diff = await leerDiff(segunda.ruta, { base: segunda.base! });
      expect(diff.texto).toContain("b.js");
      expect(diff.texto).not.toContain("a.js"); // antes adivinaba la base por el asunto y traía el trabajo de la otra
    } finally {
      await encima.cerrar(segunda);
      await taller.cerrar(primera);
    }
  });

  it("cerrar un universo no se lleva los worktrees de la persona, aunque su carpeta no esté a mano", async () => {
    // Un worktree de la persona en un disco que ahora no está: su carpeta no existe.
    const suyo = join(await mkdtemp(join(tmpdir(), "dolphin-suyo-")), "wt");
    await git(["worktree", "add", "-q", "--detach", suyo, "HEAD"], repo);
    const lejos = `${suyo}-desenchufado`;
    await rename(suyo, lejos);

    const taller = new TallerDeGit(repo, carpeta);
    const u = await taller.abrir("u1", "dolphin/x");
    await taller.cerrar(u);

    // Sigue anotado: al volver el disco, sigue siendo un worktree.
    const lista = await git(["worktree", "list", "--porcelain"], repo);
    expect(lista.replace(/\\/g, "/").toLowerCase()).toContain(suyo.replace(/\\/g, "/").toLowerCase());
    await rename(lejos, suyo);
    await git(["worktree", "remove", "--force", suyo], repo);
  });

  it("la línea base se mide en un worktree de la base: no corre en tu árbol ni te marca archivos", async () => {
    await writeFile(join(repo, "notas-privadas.txt"), "a medio hacer\n");
    const donde: string[] = [];
    const mira: Verificador = {
      nombre: "mira",
      costo: "gratis",
      async correr(u) {
        donde.push(u.ruta);
        return { paso: true, detalle: "ok", gastado: 0 };
      },
    };
    const linea = await medirLineaBase(repo, [mira]);
    expect(linea.sana).toBe(true);
    expect(donde).toHaveLength(1);
    expect(donde[0]).not.toBe(repo);
    expect(await git(["status", "--porcelain"], repo)).toContain("?? notas-privadas.txt");
    // Y el worktree de la medición ya no está.
    expect((await git(["worktree", "list"], repo)).split("\n")).toHaveLength(1);
  });
});

describe("un cambio del mismo tamaño en el mismo segundo que el commit", () => {
  let repo = "";

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  // «Racy git»: git confía en la fecha y el tamaño de cada archivo salvo que sea tan nuevo como el
  // índice. Con fechas redondas el caso es exacto en cualquier sistema: el archivo, su registro en
  // el índice y el índice dicen el mismo segundo. Una copia del índice con la fecha de ahora le
  // hacía creer a git que el archivo era viejo, y `a + b` → `a - b` no salía en el diff. En Windows
  // `copyFile` ya conserva la fecha (CopyFileW), así que este test muerde en Linux, que es el CI.
  it("se ve aunque la fecha y el tamaño digan que no cambió", async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-cambios-racy-"));
    const segundo = 1_700_000_000;
    const archivo = join(repo, "suma.js");
    await git(["init", "-q"], repo);
    await git(["config", "user.email", "nico@ejemplo.com"], repo);
    await git(["config", "user.name", "Nico"], repo);
    // El ctime no se puede fijar a mano: sin esto, el de ahora delata el cambio y el caso no se arma.
    await git(["config", "core.trustctime", "false"], repo);
    await writeFile(archivo, "export const suma = (a, b) => a + b;\n");
    await utimes(archivo, segundo, segundo);
    await git(["add", "-A"], repo);
    await git(["commit", "-qm", "base"], repo);
    await writeFile(archivo, "export const suma = (a, b) => a - b;\n");
    await utimes(archivo, segundo, segundo);
    await utimes(join(repo, ".git", "index"), segundo, segundo);

    expect((await cambiosDe(repo)).map((c) => [c.ruta, c.estado])).toEqual([["suma.js", "M"]]);
    expect((await leerDiff(repo)).texto).toContain("a - b");
  });
});
