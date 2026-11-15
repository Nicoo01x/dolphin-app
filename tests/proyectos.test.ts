import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { clonarProyecto, idDe, leerProyectos, logoDe, quitarProyecto, sumarProyecto } from "../src/nucleo/proyectos.js";

/**
 * Los proyectos de la máquina: sumar un repo, reconocer su logo, no
 * duplicarlo, sacarlo sin borrar nada, y no dejar que una «URL» sea otra cosa.
 */

const correr = promisify(execFile);

async function repoCon(carpeta: string, archivos: Record<string, string>) {
  await mkdir(carpeta, { recursive: true });
  for (const [ruta, contenido] of Object.entries(archivos)) {
    await mkdir(join(carpeta, ruta, ".."), { recursive: true });
    await writeFile(join(carpeta, ruta), contenido);
  }
  for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
    await correr("git", args, { cwd: carpeta, windowsHide: true });
  }
}

describe("los proyectos de la máquina", () => {
  let base = "";
  let hogar = "";

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "dolphin-proyectos-"));
    hogar = join(base, "hogar");
  });

  afterEach(async () => {
    await borrarCarpeta(base);
  });

  it("suma un repo con su logo, una sola vez aunque se sume dos veces", async () => {
    const tienda = join(base, "tienda");
    await repoCon(tienda, { "leeme.md": "hola\n", "public/favicon.svg": "<svg/>" });

    const p = await sumarProyecto(tienda, hogar);
    expect(p).toMatchObject({ id: idDe(tienda), nombre: "tienda", logo: "public/favicon.svg" });
    await sumarProyecto(tienda, hogar);
    expect((await leerProyectos(hogar)).map((x) => x.id)).toEqual([p.id]);
  });

  it("prefiere un logo de verdad antes que el favicon", async () => {
    const app = join(base, "app");
    await repoCon(app, { "public/favicon.ico": "x", "assets/logo.svg": "<svg/>" });
    expect(await logoDe(app)).toBe("assets/logo.svg");
  });

  it("no suma lo que no sirve para sembrar, y dice por qué", async () => {
    const suelta = join(base, "suelta");
    await mkdir(suelta);
    await expect(sumarProyecto(suelta, hogar)).rejects.toThrow("no es un repositorio git");
    expect(await leerProyectos(hogar)).toEqual([]);
  });

  it("sacarlo de la lista no borra nada del disco", async () => {
    const tienda = join(base, "tienda");
    await repoCon(tienda, { "leeme.md": "hola\n" });
    const p = await sumarProyecto(tienda, hogar);
    expect(await quitarProyecto(p.id, hogar)).toBe(true);
    expect(await leerProyectos(hogar)).toEqual([]);
    expect(await correr("git", ["rev-parse", "HEAD"], { cwd: tienda })).toBeDefined();
  });

  it("clonar solo acepta URLs de repos: ni rutas locales ni opciones de git disfrazadas", async () => {
    for (const mala of ["C:/Users/alguien/repo", "file:///etc", "--upload-pack=calc", "ext::sh -c calc", "https://ejemplo.com/a b"]) {
      await expect(clonarProyecto(mala, base, hogar)).rejects.toThrow("no parece la URL de un repo");
    }
  });
});
