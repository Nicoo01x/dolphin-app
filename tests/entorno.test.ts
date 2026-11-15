import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { comandoDeInstalacion, prepararWorktree, soltarEnlaces } from "../src/nucleo/entorno.js";
import { descartarRama } from "../src/nucleo/entrega.js";
import { TallerDeGit } from "../src/nucleo/taller.js";

/**
 * El worktree de cada rama, como el repo: sin esto el portón le cortaba a
 * la rama un código que estaba bien porque al worktree le faltaba
 * `node_modules`. Y la trampa medida del enlace: `git worktree remove`
 * lo sigue y le borra al repo el suyo.
 */

const correr = promisify(execFile);
const existe = (ruta: string) => stat(ruta).then(() => true, () => false);

describe("el worktree se prepara solo", () => {
  let repo = "";
  let carpeta = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-entorno-"));
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-entorno-wt-"));
    await mkdir(join(repo, "src"), { recursive: true });
    await writeFile(join(repo, "package.json"), JSON.stringify({ name: "con-dependencia", type: "module", scripts: { test: "node --test" } }));
    await writeFile(join(repo, "src", "hola.js"), 'import { saludo } from "saludo";\nexport const hola = (n) => saludo(n);\n');
    await writeFile(
      join(repo, "src", "hola.test.js"),
      'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { hola } from "./hola.js";\ntest("saluda", () => assert.equal(hola("Nico"), "hola, Nico"));\n',
    );
    await writeFile(join(repo, ".gitignore"), "node_modules\n.env\nconfig/secreto.json\n");
    // La dependencia «instalada»: está en node_modules, que git no versiona.
    await mkdir(join(repo, "node_modules", "saludo"), { recursive: true });
    await writeFile(join(repo, "node_modules", "saludo", "package.json"), JSON.stringify({ name: "saludo", type: "module", exports: "./index.js" }));
    await writeFile(join(repo, "node_modules", "saludo", "index.js"), "export const saludo = (n) => `hola, ${n}`;\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
  });

  afterEach(async () => {
    await correr("git", ["worktree", "prune"], { cwd: repo }).catch(() => {});
    await borrarCarpeta(carpeta);
    await borrarCarpeta(repo);
  });

  const testsDe = (ruta: string) =>
    correr(process.execPath, ["--test"], { cwd: ruta, windowsHide: true }).then(
      () => "pasan",
      (e: { stdout?: string; stderr?: string }) => `fallan: ${(e.stdout ?? "") + (e.stderr ?? "")}`,
    );

  it("sin preparar, los tests de la rama fallan por la máquina; preparado, pasan", async () => {
    const crudo = await new TallerDeGit(repo, carpeta, "HEAD", null).abrir("u1", "dolphin/c1");
    const sinPreparar = await testsDe(crudo.ruta);
    expect(sinPreparar).toMatch(/^fallan/);
    expect(sinPreparar).toMatch(/saludo/);

    const listo = await new TallerDeGit(repo, carpeta).abrir("u2", "dolphin/c2");
    expect(await testsDe(listo.ruta)).toBe("pasan");
    expect(listo.preparado?.pasos).toContain("enlazó node_modules del repo");
  });

  it("cerrar el worktree NO le borra al repo su node_modules (el remove seguía el enlace)", async () => {
    const taller = new TallerDeGit(repo, carpeta);
    const universo = await taller.abrir("u1", "dolphin/c1");
    expect(await existe(join(universo.ruta, "node_modules", "saludo", "index.js"))).toBe(true);
    await taller.cerrar(universo);
    expect(await existe(universo.ruta)).toBe(false);
    expect(await existe(join(repo, "node_modules", "saludo", "index.js"))).toBe(true);

    // Lo mismo al descartar una rama entregada.
    const otro = await taller.abrir("u2", "dolphin/c2");
    await descartarRama(repo, { rama: otro.rama, commit: "x", base: "y" }, otro.ruta);
    expect(await existe(join(repo, "node_modules", "saludo", "index.js"))).toBe(true);
  });

  it("soltar el enlace no toca lo enlazado", async () => {
    const universo = await new TallerDeGit(repo, carpeta).abrir("u1", "dolphin/c1");
    await soltarEnlaces(universo.ruta);
    expect(await existe(join(universo.ruta, "node_modules"))).toBe(false);
    expect(await existe(join(repo, "node_modules", "saludo", "index.js"))).toBe(true);
    // Una carpeta de verdad no se toca: solo se sueltan enlaces.
    await mkdir(join(universo.ruta, "node_modules", "propio"), { recursive: true });
    await soltarEnlaces(universo.ruta);
    expect(await existe(join(universo.ruta, "node_modules", "propio"))).toBe(true);
  });

  it("copia el .env y lo de .worktreeinclude sin pisar ni salirse del repo", async () => {
    await writeFile(join(repo, ".env"), "CLAVE=del-repo\n");
    await mkdir(join(repo, "config"), { recursive: true });
    await writeFile(join(repo, "config", "secreto.json"), "{}");
    await writeFile(join(repo, ".worktreeinclude"), "# lo que la app necesita\nconfig/secreto.json\n../afuera.txt\n");
    const worktree = join(carpeta, "a-mano");
    await correr("git", ["worktree", "add", "-q", "-b", "a-mano", worktree], { cwd: repo });
    await writeFile(join(worktree, ".env"), "CLAVE=de-la-rama\n");

    const { pasos } = await prepararWorktree(repo, worktree);
    expect(pasos).toContain("copió config/secreto.json");
    expect(await readFile(join(worktree, ".env"), "utf8")).toBe("CLAVE=de-la-rama\n");
    expect(await existe(join(carpeta, "afuera.txt"))).toBe(false);
    await soltarEnlaces(worktree);
  });

  it("el comando «preparar» del repo corre, salvo que el repo o la tarea sean de afuera", async () => {
    const worktree = join(carpeta, "prep");
    await correr("git", ["worktree", "add", "-q", "-b", "prep", worktree], { cwd: repo });
    const preparar = `node -e "require('fs').writeFileSync('preparado.txt', 'listo')"`;

    const deAfuera = await prepararWorktree(repo, worktree, { preparar, dependencias: "nada" }, { deAfuera: true });
    expect(await existe(join(worktree, "preparado.txt"))).toBe(false);
    expect(deAfuera.pasos).toContain("no corrió «preparar»: el repo o la tarea son de afuera");

    const propio = await prepararWorktree(repo, worktree, { preparar, dependencias: "nada" });
    expect(await readFile(join(worktree, "preparado.txt"), "utf8")).toBe("listo");
    expect(propio.porQue).toBeUndefined();

    const roto = await prepararWorktree(repo, worktree, { preparar: "node -e \"process.exit(3)\"", dependencias: "nada" });
    expect(roto.porQue).toMatch(/salió con 3/);
  });

  it("«instalar» usa el gestor del repo, sin red si se puede, y sin scripts si es de afuera", async () => {
    expect(await comandoDeInstalacion(repo)).toBe("npm install --prefer-offline --no-audit --no-fund");
    await writeFile(join(repo, "package-lock.json"), "{}");
    expect(await comandoDeInstalacion(repo)).toBe("npm ci --prefer-offline --no-audit --no-fund");
    await writeFile(join(repo, "pnpm-lock.yaml"), "");
    expect(await comandoDeInstalacion(repo, true)).toBe("pnpm install --frozen-lockfile --prefer-offline --ignore-scripts");
    expect(await comandoDeInstalacion(carpeta)).toBeNull();
  });
});
