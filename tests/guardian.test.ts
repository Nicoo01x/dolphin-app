import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { resolverEjecutable } from "../src/agentes/ejecutar.js";
import { leerBandeja } from "../src/nucleo/bandeja.js";
import { autorizarFases, fasesDeGuardian, leerGuardian, revisarConGuardian } from "../src/nucleo/guardian.js";
import { fasesDelPaquete } from "../src/nucleo/verificadores.js";
import { idDe } from "../src/nucleo/proyectos.js";

/**
 * Guardian mira la rama principal a cero tokens: corre las fases
 * autorizadas en un worktree propio, compara contra la última base verde,
 * repite lo que se rompió para no alarmar por un test inestable, encuentra
 * al culpable con git bisect y deja una tarjeta —sin tocar nada del repo—.
 */

const correr = promisify(execFile);
const git = (repo: string, ...args: string[]) =>
  correr("git", ["-c", "user.email=nico@dolphin", "-c", "user.name=Nico", ...args], { cwd: repo, windowsHide: true }).then((r) => r.stdout.trim());

describe("Guardian", () => {
  let repo = "";
  let afuera = "";

  const commit = async (mensaje: string, archivos: Record<string, string>) => {
    for (const [ruta, texto] of Object.entries(archivos)) {
      await mkdir(join(repo, ruta, ".."), { recursive: true });
      await writeFile(join(repo, ruta), texto);
    }
    await git(repo, "add", "-A");
    await git(repo, "commit", "-qm", mensaje);
    return git(repo, "rev-parse", "HEAD");
  };
  // Lo que Guardian no puede tocar: la rama, el HEAD, el árbol y la lista de worktrees.
  const foto = async () => ({
    head: await git(repo, "rev-parse", "HEAD"),
    rama: await git(repo, "rev-parse", "--abbrev-ref", "HEAD"),
    estado: await git(repo, "status", "--porcelain"),
    worktrees: (await git(repo, "worktree", "list", "--porcelain")).split("\n").filter((l) => l.startsWith("worktree ")).length,
    bisect: await git(repo, "for-each-ref", "refs/bisect"),
  });

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-guardian-repo-"));
    afuera = await mkdtemp(join(tmpdir(), "dolphin-guardian-afuera-"));
    await git(repo, "init", "-q", "-b", "main");
    await commit("base", {
      "package.json": JSON.stringify({ name: "tiendita", type: "module", scripts: { test: "node --test", build: "node -e \"process.exit(1)\"" } }),
      "src/suma.js": "export const suma = (a, b) => a + b;\n",
      "src/suma.test.js": 'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { suma } from "./suma.js";\ntest("suma", () => assert.equal(suma(2, 3), 5));\n',
    });
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
    await borrarCarpeta(afuera);
  });

  it("corre solo las fases que sirven: «build» no está entre las de siempre", async () => {
    expect(await fasesDeGuardian(repo)).toEqual(["test"]);
    expect(await fasesDeGuardian(repo, { fases: ["test", "build"] })).toEqual(["test", "build"]);
    // La consola ofrece todas las del paquete, de la más barata a la más cara: es la misma lista.
    expect(await fasesDelPaquete(repo)).toEqual(["test", "build"]);
  });

  it("toma la base verde, encuentra al culpable de lo que se rompe y deja la tarjeta sin tocar el repo", async () => {
    const primera = await revisarConGuardian(repo);
    expect(primera).toMatchObject({ reviso: true, nuevas: [], sinBase: [] });
    const base = await git(repo, "rev-parse", "HEAD");
    expect((await leerGuardian(repo)).base?.sha).toBe(base);

    // El mismo commit no se vuelve a revisar: cero trabajo si no hay nada nuevo.
    expect((await revisarConGuardian(repo)).reviso).toBe(false);

    await commit("docs: el README", { "README.md": "# tiendita\n" });
    const culpable = await commit("cambia el redondeo de la suma", { "src/suma.js": "export const suma = (a, b) => a + b + 1;\n" });
    await commit("docs: una línea más", { "README.md": "# tiendita\n\nsuma cosas\n" });
    const antes = await foto();

    const informe = await revisarConGuardian(repo);
    expect(informe.nuevas).toHaveLength(1);
    const [regresion] = informe.nuevas;
    expect(regresion).toMatchObject({ fase: "test", desde: base, culpable: { sha: culpable, mensaje: "cambia el redondeo de la suma", autor: "Nico", archivos: ["src/suma.js"] } });

    const bandeja = await leerBandeja(repo);
    const tarjeta = bandeja.asuntos.find((a) => a.id === regresion!.asunto);
    expect(tarjeta).toMatchObject({ tipo: "error", origen: "guardian", estado: "abierto", donde: "fase test" });
    expect(tarjeta!.titulo).toBe(`«test» se rompió en ${culpable.slice(0, 7)}: cambia el redondeo de la suma`);
    expect(tarjeta!.pasos).toEqual([`git checkout ${culpable}`, "npm run test"]);
    expect(tarjeta!.propuesta).toContain("src/suma.js");

    // Sin tocar nada: misma rama, mismo HEAD, árbol limpio (su carpeta se ignora sola), sin worktrees ni bisect colgados.
    expect(await foto()).toEqual(antes);
    expect(antes).toMatchObject({ rama: "main", estado: "", worktrees: 1, bisect: "" });

    // Un commit que no arregla nada no repite la tarjeta.
    await commit("docs: otra", { "README.md": "# tiendita\n" });
    expect((await revisarConGuardian(repo)).nuevas).toEqual([]);
    expect((await leerBandeja(repo)).asuntos).toHaveLength(1);

    // Y cuando vuelve a pasar, la tarjeta se cierra sola y hay base nueva.
    const arreglo = await commit("arregla la suma", { "src/suma.js": "export const suma = (a, b) => a + b;\n" });
    expect((await revisarConGuardian(repo)).arregladas).toEqual(["test"]);
    expect((await leerBandeja(repo)).asuntos[0]).toMatchObject({ estado: "hecho", resuelto: `Guardian volvió a correr «test» en ${arreglo.slice(0, 7)} y pasa` });
    expect(await leerGuardian(repo)).toMatchObject({ base: { sha: arreglo }, regresiones: [] });
  }, 120_000);

  it("un test que falla una vez y al repetirlo pasa es inestable: no alarma ni deja tarjeta", async () => {
    await revisarConGuardian(repo);
    // Falla la primera vez que corre en esta máquina y después pasa (el contador vive afuera del repo).
    const contador = join(afuera, "veces.txt").replace(/\\/g, "/");
    await commit("un test que depende de la suerte", {
      "src/suerte.test.js": `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { existsSync, writeFileSync } from "node:fs";\ntest("suerte", () => {\n  const primera = !existsSync(${JSON.stringify(contador)});\n  writeFileSync(${JSON.stringify(contador)}, "1");\n  assert.equal(primera, false);\n});\n`,
    });
    const informe = await revisarConGuardian(repo);
    expect(informe).toMatchObject({ reviso: true, nuevas: [], inestables: ["test"] });
    expect((await leerBandeja(repo)).asuntos).toEqual([]);
    expect((await leerGuardian(repo)).inestables).toEqual([expect.objectContaining({ fase: "test" })]);
  }, 60_000);

  it("si el repo ya venía en rojo no inventa un culpable: lo dice y espera la primera base verde", async () => {
    await commit("rompe la suma", { "src/suma.js": "export const suma = (a, b) => a - b;\n" });
    const informe = await revisarConGuardian(repo);
    expect(informe).toMatchObject({ reviso: true, nuevas: [], sinBase: ["test"] });
    expect((await leerGuardian(repo)).base).toBeUndefined();
    expect((await leerBandeja(repo)).asuntos).toEqual([]);
  }, 60_000);

  it("en un repo clonado no corre nada que no se haya autorizado a mano", async () => {
    const hogar = await mkdtemp(join(tmpdir(), "dolphin-guardian-hogar-"));
    const anterior = process.env.DOLPHIN_HOME;
    process.env.DOLPHIN_HOME = hogar;
    try {
      await writeFile(
        join(hogar, "proyectos.json"),
        JSON.stringify({ version: 1, proyectos: [{ id: idDe(repo), nombre: "tiendita", ruta: repo, agregado: "2026-10-22T00:00:00.000Z", origen: "https://github.com/alguien/tiendita.git" }] }),
      );
      const informe = await revisarConGuardian(repo);
      expect(informe.reviso).toBe(false);
      expect(informe.porQue).toContain("--autorizar");

      // El config que vino con el código no autoriza nada: un repo publicado con
      // `guardian.fases` se autorizaba solo y Guardian corría sus scripts.
      await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ guardian: { fases: ["test"] } }));
      expect((await revisarConGuardian(repo)).reviso).toBe(false);

      // Lo autoriza su dueño, desde acá.
      await autorizarFases(repo, ["test"]);
      expect((await revisarConGuardian(repo)).reviso).toBe(true);
    } finally {
      if (anterior === undefined) delete process.env.DOLPHIN_HOME;
      else process.env.DOLPHIN_HOME = anterior;
      await borrarCarpeta(hogar);
    }
  }, 60_000);

  it("con un lint en rojo hace meses, igual ve que se rompió el test: cada fase tiene su base", async () => {
    await commit("un lint que siempre falla", {
      "package.json": JSON.stringify({ name: "tiendita", type: "module", scripts: { test: "node --test", lint: "node -e \"process.exit(1)\"" } }),
    });
    const primera = await revisarConGuardian(repo);
    expect(primera).toMatchObject({ reviso: true, sinBase: ["lint"] });

    const culpable = await commit("rompe la suma", { "src/suma.js": "export const suma = (a, b) => a - b;\n" });
    const informe = await revisarConGuardian(repo);
    expect(informe.nuevas.map((g) => g.fase)).toEqual(["test"]);
    expect(informe.nuevas[0]!.culpable?.sha).toBe(culpable);
  }, 120_000);

  it("mira la rama principal, no la que tengas en HEAD: un WIP en otra rama no deja tarjeta", async () => {
    await revisarConGuardian(repo);
    await git(repo, "checkout", "-q", "-b", "probando");
    await commit("wip: probando otra cosa", { "src/suma.js": "export const suma = () => 0;\n" });
    const informe = await revisarConGuardian(repo);
    expect(informe.reviso).toBe(false); // main no cambió
    expect((await leerBandeja(repo)).asuntos).toEqual([]);
    await git(repo, "checkout", "-q", "main");
  }, 60_000);

  it("una fase que no corrió no cuenta como verde: no mueve la base ni cierra tarjetas", async () => {
    await revisarConGuardian(repo);
    const base = (await leerGuardian(repo)).bases?.["test"]?.sha;
    // Sin npm en el PATH (con git, que Guardian necesita), la fase se saltea.
    const path = process.env.PATH;
    process.env.PATH = dirname(resolverEjecutable("git")!);
    try {
      await commit("docs", { "README.md": "# tiendita\n" });
      const informe = await revisarConGuardian(repo);
      expect(informe.revision?.fases[0]).toMatchObject({ nombre: "test", salteada: true });
    } finally {
      process.env.PATH = path;
    }
    expect((await leerGuardian(repo)).bases?.["test"]?.sha).toBe(base);
  }, 60_000);
});
