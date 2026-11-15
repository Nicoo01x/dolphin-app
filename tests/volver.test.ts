import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { comoSeLee, CUANTOS_SE_GUARDAN, guardarEstado, listarGuardados, porQueNoSePuedeVolver, volverA } from "../src/nucleo/volver.js";

/** Volver a cuando andaba, sin saber git: y que volver nunca pierda nada. */

const correr = promisify(execFile);

describe("los momentos a los que se puede volver", () => {
  let repo = "";
  const git = (args: readonly string[]) => correr("git", [...args], { cwd: repo, windowsHide: true });
  const leer = (archivo: string) => readFile(join(repo, archivo), "utf8");
  const escribir = (archivo: string, texto: string) => writeFile(join(repo, archivo), texto);

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-volver-"));
    await escribir(".gitignore", "node_modules\n.env\n");
    await escribir("app.js", "console.log('anda')\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await git(args);
    }
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("guarda el estado de ahora y lo deja en la lista, con por qué", async () => {
    const punto = await guardarEstado(repo, { porQue: "pasó el portón", fases: ["test", "typecheck"] });
    expect(punto).toBeDefined();
    const lista = await listarGuardados(repo);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ porQue: "pasó el portón", fases: ["test", "typecheck"] });
    expect(comoSeLee(lista[0]!)).toContain("pasó el portón");
    expect(comoSeLee(lista[0]!)).toContain("test, typecheck");
  });

  it("no toca tu rama ni tu HEAD: el punto no aparece en tu historial", async () => {
    const antes = (await git(["rev-parse", "HEAD"])).stdout.trim();
    const commits = (await git(["rev-list", "--count", "HEAD"])).stdout.trim();
    await guardarEstado(repo, { porQue: "pasó el portón" });
    expect((await git(["rev-parse", "HEAD"])).stdout.trim()).toBe(antes);
    expect((await git(["rev-list", "--count", "HEAD"])).stdout.trim()).toBe(commits);
    expect((await git(["symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe("main");
  });

  it("vuelve el código a como estaba", async () => {
    const bueno = await guardarEstado(repo, { porQue: "pasó el portón" });
    await escribir("app.js", "console.log('ROTO')\n");
    await escribir("nuevo.js", "// esto lo escribí después\n");

    await volverA(repo, bueno!.id);
    expect(await leer("app.js")).toContain("anda");
    // Lo que se creó después del punto se va: volver es volver, no mezclar.
    expect(existsSync(join(repo, "nuevo.js"))).toBe(false);
  });

  it("guarda lo que había antes de volver, así volver también se deshace", async () => {
    const bueno = await guardarEstado(repo, { porQue: "pasó el portón" });
    await escribir("app.js", "console.log('a medias pero lo quiero')\n");

    const vuelta = await volverA(repo, bueno!.id);
    expect(vuelta.loQueHabia).toBeDefined();
    expect(await leer("app.js")).toContain("anda");

    // Y se puede deshacer la vuelta.
    await volverA(repo, vuelta.loQueHabia!.id);
    expect(await leer("app.js")).toContain("a medias pero lo quiero");
  });

  it("lo que no estaba commiteado también entra al punto", async () => {
    await escribir("app.js", "console.log('sin commitear')\n");
    const punto = await guardarEstado(repo, { porQue: "pasó el portón" });
    expect(punto?.conCambiosSinCommitear).toBe(true);
    await escribir("app.js", "console.log('otra cosa')\n");
    await volverA(repo, punto!.id);
    expect(await leer("app.js")).toContain("sin commitear");
  });

  it("no te vacía la carpeta: lo que git ignora queda donde está", async () => {
    const punto = await guardarEstado(repo, { porQue: "pasó el portón" });
    await mkdir(join(repo, "node_modules", "algo"), { recursive: true });
    await escribir("node_modules/algo/index.js", "module.exports = 1\n");
    await escribir(".env", "CLAVE=secreta\n");

    await volverA(repo, punto!.id);
    expect(existsSync(join(repo, "node_modules", "algo", "index.js"))).toBe(true);
    expect(await leer(".env")).toContain("CLAVE=secreta");
  });

  it("el id se puede abreviar, como un hash de git", async () => {
    const punto = await guardarEstado(repo, { porQue: "pasó el portón" });
    await escribir("app.js", "roto\n");
    await volverA(repo, punto!.id.slice(0, 6));
    expect(await leer("app.js")).toContain("anda");
  });

  it("un momento que no existe lo dice, en vez de hacer cualquier cosa", async () => {
    await expect(volverA(repo, "no-existe")).rejects.toThrow(/no encuentro/);
  });

  it("en medio de un merge no se vuelve: se avisa qué hay que hacer primero", async () => {
    await git(["checkout", "-q", "-b", "otra"]);
    await escribir("app.js", "console.log('de la otra rama')\n");
    await git(["add", "-A"]);
    await git(["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "otra"]);
    await git(["checkout", "-q", "main"]);
    await escribir("app.js", "console.log('de main')\n");
    await git(["add", "-A"]);
    await git(["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "main"]);
    await git(["merge", "otra"]).catch(() => undefined); // choca a propósito

    expect(await porQueNoSePuedeVolver(repo)).toContain("merge a medias");
    const punto = await guardarEstado(repo, { porQue: "pasó el portón" });
    if (punto) await expect(volverA(repo, punto.id)).rejects.toThrow(/merge a medias/);
  });

  it("los momentos no se acumulan para siempre, y los commits sueltos se sueltan", async () => {
    for (let i = 0; i < CUANTOS_SE_GUARDAN + 5; i++) {
      await escribir("app.js", `console.log(${i})\n`);
      await guardarEstado(repo, { porQue: `vuelta ${i}` });
    }
    const lista = await listarGuardados(repo);
    expect(lista).toHaveLength(CUANTOS_SE_GUARDAN);
    // El más nuevo primero, y los viejos ya no tienen su referencia.
    expect(lista[0]?.porQue).toBe(`vuelta ${CUANTOS_SE_GUARDAN + 4}`);
    const refs = (await git(["for-each-ref", "--format=%(refname)", "refs/dolphin/guardados"])).stdout.trim().split("\n").filter(Boolean);
    expect(refs).toHaveLength(CUANTOS_SE_GUARDAN);
  });

  it("un repo sin un solo commit no rompe nada: todavía no hay a dónde volver", async () => {
    const vacio = await mkdtemp(join(tmpdir(), "dolphin-volver-vacio-"));
    try {
      await correr("git", ["init", "-q", "-b", "main"], { cwd: vacio, windowsHide: true });
      expect(await guardarEstado(vacio, { porQue: "pasó el portón" })).toBeUndefined();
      expect(await listarGuardados(vacio)).toEqual([]);
    } finally {
      await rm(vacio, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  });
});
