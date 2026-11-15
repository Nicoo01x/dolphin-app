import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { agregadosDe } from "../src/nucleo/cambios.js";
import { entregadorDeGit } from "../src/nucleo/entrega.js";
import { enlazaDependencias, paquetesAnidadosAEnlazar, paquetesVersionados, prepararWorktree, soltarEnlaces } from "../src/nucleo/entorno.js";
import { TallerDeGit } from "../src/nucleo/taller.js";

/**
 * Los `node_modules` de los paquetes anidados. Un repo con `apps/web/` (o `escritorio/`) que tiene
 * SU `node_modules` nacía en el universo con el de la raíz y sin el del paquete. Y con varios
 * enlaces, el que quede sin soltar es el `node_modules` real de ese paquete en manos del
 * `git worktree remove`: lo central de acá es que cerrar el universo no toca ninguno del origen.
 */

const correr = promisify(execFile);
const existe = (ruta: string) => stat(ruta).then(() => true, () => false);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true }).then((r) => r.stdout.trim());
const confirmar = (cwd: string, mensaje: string) => git(["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", mensaje], cwd);

/** Las marcas que dejan los `node_modules` del origen: si siguen ahí, no se borró nada. */
const MARCAS = ["node_modules/raiz/index.js", "apps/web/node_modules/web/index.js"];

describe("los node_modules anidados", () => {
  let repo = "";
  let carpeta = "";

  /** Un paquete versionado con su `node_modules` instalado (y sin versionar). */
  const paquete = async (dir: string, extra: Record<string, unknown> = {}) => {
    await mkdir(join(repo, dir, "node_modules", dir === "." ? "raiz" : dir.split("/").pop()!), { recursive: true });
    await writeFile(join(repo, dir, "package.json"), JSON.stringify({ name: dir, ...extra }));
    await writeFile(join(repo, dir, "node_modules", dir === "." ? "raiz" : dir.split("/").pop()!, "index.js"), "export {};\n");
  };

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-anidados-"));
    carpeta = await mkdtemp(join(tmpdir(), "dolphin-anidados-wt-"));
    await git(["init", "-q", "-b", "main"], repo);
    await paquete(".");
    await paquete("apps/web");
    await writeFile(join(repo, ".gitignore"), "node_modules\n");
    await git(["add", "-A"], repo);
    await confirmar(repo, "base");
  });

  afterEach(async () => {
    await git(["worktree", "prune"], repo).catch(() => "");
    await borrarCarpeta(carpeta);
    await borrarCarpeta(repo);
  });

  const intactos = async () => {
    for (const marca of MARCAS) expect(await existe(join(repo, marca)), marca).toBe(true);
  };

  it("el universo nace con el de la raíz Y el de apps/web enlazados, y lo dice en el parte", async () => {
    const universo = await new TallerDeGit(repo, carpeta).abrir("u1", "dolphin/c1");
    for (const marca of MARCAS) expect(await existe(join(universo.ruta, marca)), marca).toBe(true);
    expect(universo.preparado?.pasos).toContain("enlazó node_modules del repo");
    expect(universo.preparado?.pasos).toContain("enlazó apps/web/node_modules del repo");
    await new TallerDeGit(repo, carpeta).cerrar(universo);
  });

  it("cerrar el universo suelta TODOS los enlaces y los node_modules del origen quedan intactos", async () => {
    const taller = new TallerDeGit(repo, carpeta);
    const universo = await taller.abrir("u1", "dolphin/c1");
    await taller.cerrar(universo);
    expect(await existe(universo.ruta)).toBe(false);
    await intactos();

    // Y soltar sin cerrar (lo que hace la siembra con la rama elegida): afuera los dos, el origen sigue.
    const otro = await taller.abrir("u2", "dolphin/c2");
    await taller.soltar(otro);
    expect(await existe(join(otro.ruta, "node_modules"))).toBe(false);
    expect(await existe(join(otro.ruta, "apps", "web", "node_modules"))).toBe(false);
    expect(await existe(join(otro.ruta, "apps", "web", "package.json"))).toBe(true);
    await intactos();
    await taller.cerrar(otro);
    await intactos();
  });

  it("suelta los enlaces anidados que este proceso no creó (el barrido de un universo huérfano)", async () => {
    const worktree = join(carpeta, "huerfano");
    await git(["worktree", "add", "-q", "-b", "huerfano", worktree], repo);
    // Otro proceso los puso: acá no hay registro, el disco es lo único que dice dónde están.
    await symlink(join(repo, "node_modules"), join(worktree, "node_modules"), "junction");
    await symlink(join(repo, "apps", "web", "node_modules"), join(worktree, "apps", "web", "node_modules"), "junction");
    // Una carpeta de verdad con ese nombre no se toca.
    await mkdir(join(worktree, "apps", "propio", "node_modules", "mio"), { recursive: true });

    await soltarEnlaces(worktree);
    expect(await existe(join(worktree, "node_modules"))).toBe(false);
    expect(await existe(join(worktree, "apps", "web", "node_modules"))).toBe(false);
    expect(await existe(join(worktree, "apps", "propio", "node_modules", "mio"))).toBe(true);
    await intactos();
  });

  it("una carpeta que la rama no tiene no se crea", async () => {
    const primero = await git(["rev-parse", "HEAD"], repo);
    await paquete("libs/ui");
    await git(["add", "-A"], repo);
    await confirmar(repo, "suma libs/ui");

    // Desde el commit en que libs/ui no existía.
    const viejo = await new TallerDeGit(repo, carpeta, primero).abrir("u1", "dolphin/c1");
    expect(await existe(join(viejo.ruta, "libs"))).toBe(false);
    expect(await existe(join(viejo.ruta, "apps", "web", "node_modules", "web", "index.js"))).toBe(true);

    const nuevo = await new TallerDeGit(repo, carpeta).abrir("u2", "dolphin/c2");
    expect(await existe(join(nuevo.ruta, "libs", "ui", "node_modules", "ui", "index.js"))).toBe(true);
    const taller = new TallerDeGit(repo, carpeta);
    await taller.cerrar(viejo);
    await taller.cerrar(nuevo);
    expect(await existe(join(repo, "libs", "ui", "node_modules", "ui", "index.js"))).toBe(true);
    await intactos();
  });

  it("lo que la persona forzó en la config se respeta", async () => {
    const worktree = (nombre: string) => join(carpeta, nombre);
    const abrir = async (nombre: string) => {
      await git(["worktree", "add", "-q", "-b", nombre, worktree(nombre)], repo);
      return worktree(nombre);
    };

    const sin = await abrir("sin");
    const nada = await prepararWorktree(repo, sin, { dependencias: "nada" });
    expect(nada.enlaces).toBeUndefined();
    expect(await existe(join(sin, "node_modules"))).toBe(false);
    expect(await existe(join(sin, "apps", "web", "node_modules"))).toBe(false);

    // «instalar» forzado no enlaza nada anidado (y acá no hay lockfile ni red: se prueba el criterio, no el gestor).
    expect(await paquetesAnidadosAEnlazar(repo, "instalar")).toEqual([]);
    expect(await paquetesAnidadosAEnlazar(repo, "nada")).toEqual([]);
    expect(await paquetesAnidadosAEnlazar(repo, "enlazar")).toEqual(["apps/web"]);

    // «enlazar» forzado en un monorepo: enlaza también los miembros, porque la persona lo pidió.
    await writeFile(join(repo, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    expect(await paquetesAnidadosAEnlazar(repo, "enlazar")).toEqual(["apps/web"]);
    const forzado = await abrir("forzado");
    const hecho = await prepararWorktree(repo, forzado, { dependencias: "enlazar" });
    expect([...(hecho.enlaces ?? [])].sort()).toEqual(["apps/web/node_modules", "node_modules"]);
    await soltarEnlaces(forzado);
    await soltarEnlaces(sin);
    await intactos();
  });

  it("sin config, en un monorepo sólo se enlazan los paquetes que son su propio workspace", async () => {
    await writeFile(join(repo, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    // apps/web es miembro del workspace de la raíz: lo arma la instalación de la raíz.
    expect(await paquetesAnidadosAEnlazar(repo)).toEqual([]);

    // escritorio/ tiene su propio workspace e instalación: ese sí.
    await paquete("escritorio");
    await writeFile(join(repo, "escritorio", "pnpm-workspace.yaml"), "packages:\n  - '.'\n");
    await git(["add", "-A"], repo);
    await confirmar(repo, "suma escritorio");
    expect(await paquetesAnidadosAEnlazar(repo)).toEqual(["escritorio"]);
    // La raíz instala, pero igual hay un enlace puesto: instalar desde el universo escribiría en el de escritorio/.
    expect(await enlazaDependencias(repo)).toBe(true);
    expect(await enlazaDependencias(repo, "instalar")).toBe(false);
  });

  it("los paquetes se buscan en lo versionado y no se baja a carpetas de build ni a un node_modules", async () => {
    await mkdir(join(repo, "dist", "x"), { recursive: true });
    await writeFile(join(repo, "dist", "x", "package.json"), "{}");
    await mkdir(join(repo, "sin-versionar"), { recursive: true });
    await writeFile(join(repo, "sin-versionar", "package.json"), "{}");
    await git(["add", "-f", "dist"], repo);
    await confirmar(repo, "un dist versionado");
    expect(await paquetesVersionados(repo)).toEqual(["apps/web"]);
  });

  it("el enlace anidado no es trabajo de la rama: no llega al commit de entrega", async () => {
    // Sólo se ignora el de la raíz: el de apps/web queda a la vista de git, y lo único que lo frena es la anotación.
    await writeFile(join(repo, ".gitignore"), "/node_modules\n");
    await git(["add", ".gitignore"], repo);
    await confirmar(repo, "ignora sólo el de la raíz");
    const universo = await new TallerDeGit(repo, carpeta).abrir("u1", "dolphin/c1");
    expect(await agregadosDe(universo.ruta)).toContain("apps/web/node_modules");

    await writeFile(join(universo.ruta, "nuevo.txt"), "trabajo de la rama\n");
    await entregadorDeGit(repo).commitear(universo.ruta, "entrega");
    const archivos = (await git(["show", "--name-only", "--format=", "HEAD"], universo.ruta)).split(/\r?\n/);
    expect(archivos).toEqual(["nuevo.txt"]);
    expect(await readFile(join(universo.ruta, "nuevo.txt"), "utf8")).toContain("trabajo");
    await new TallerDeGit(repo, carpeta).cerrar(universo);
    await intactos();
  });
});
