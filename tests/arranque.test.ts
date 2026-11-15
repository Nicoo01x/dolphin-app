import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { configPropuesta, decirDeteccion, detectarProyecto } from "../src/nucleo/arranque.js";
import { sumarProyecto } from "../src/nucleo/proyectos.js";
import { verificadoresDelPorton } from "../src/nucleo/verificadores.js";
import { prepararSiembra } from "../src/siembra.js";
import { Sesion } from "../src/tui/sesion.js";

/**
 * Arranque en 30 s: qué es el repo, con qué se instala y qué prueba el portón; la propuesta del
 * dolphin.config.json se escribe con un «dale» y se pregunta una sola vez.
 */

let repo = "";
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-arranque-"));
});
afterEach(async () => {
  await borrarCarpeta(repo);
});

describe("qué proyecto es", () => {
  it("node: los scripts que ya existen (sin los que construyen) y el gestor por el lockfile", async () => {
    await writeFile(join(repo, "package.json"), JSON.stringify({ scripts: { test: "vitest", typecheck: "tsc", build: "vite build", dev: "vite" } }));
    await writeFile(join(repo, "pnpm-lock.yaml"), "");
    const d = await detectarProyecto(repo);
    expect(d).toMatchObject({ stack: "node", gestor: "pnpm", verificar: ["typecheck", "test"] });
    expect(configPropuesta(d)).toEqual({ terminal: { verificar: ["typecheck", "test"] } });
    expect(decirDeteccion(d)).toBe("Es un proyecto de Node (con pnpm). Para probar cada cambio voy a correr: typecheck › test.");
  });

  it("python con uv: ruff, mypy y pytest por uv run", async () => {
    await writeFile(join(repo, "pyproject.toml"), "[tool.ruff]\nline-length = 100\n[tool.mypy]\nstrict = true\n[tool.pytest.ini_options]\n");
    await writeFile(join(repo, "uv.lock"), "");
    const d = await detectarProyecto(repo);
    expect(d.stack).toBe("python");
    expect(d.comandos).toEqual([
      { nombre: "lint", cmd: "uv", args: ["run", "ruff", "check", "."] },
      { nombre: "typecheck", cmd: "uv", args: ["run", "mypy", "."] },
      { nombre: "test", cmd: "uv", args: ["run", "pytest", "-q"] },
    ]);
  });

  it("python sin tests: lo dice, y no inventa un portón", async () => {
    await writeFile(join(repo, "requirements.txt"), "requests\n");
    const d = await detectarProyecto(repo);
    expect(d).toMatchObject({ stack: "python", gestor: "pip", comandos: [] });
    expect(d.notas[0]).toContain("No encontré tests");
    expect(configPropuesta(d)).toEqual({});
  });

  it("go y rust con sus comandos de siempre; y lo desconocido, dicho", async () => {
    await writeFile(join(repo, "go.mod"), "module x\n");
    expect((await detectarProyecto(repo)).comandos.map((c) => c.nombre)).toEqual(["vet", "test"]);
    await rm(join(repo, "go.mod"));
    await writeFile(join(repo, "Cargo.toml"), "[package]\n");
    expect((await detectarProyecto(repo)).comandos.map((c) => [c.cmd, ...c.args].join(" "))).toEqual(["cargo check --quiet", "cargo test --quiet"]);
    await rm(join(repo, "Cargo.toml"));
    expect((await detectarProyecto(repo)).stack).toBe("desconocido");
  });
});

describe("el portón con comandos del config", () => {
  it("valida lo que viene del archivo: sin nombre o sin comando no entra", () => {
    const v = verificadoresDelPorton([{ nombre: "test", cmd: "go", args: ["test", "./..."] }, { nombre: 3, cmd: "x" }, { cmd: "y" }, null]);
    expect(v.map((x) => x.nombre)).toEqual(["test"]);
  });

  it("los corre en un repo tuyo y NO en uno clonado de afuera (su configuración no se ejecuta)", async () => {
    const hogar = await mkdtemp(join(tmpdir(), "dolphin-hogar-"));
    const antes = process.env.DOLPHIN_HOME;
    process.env.DOLPHIN_HOME = hogar;
    try {
      await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ porton: { comandos: [{ nombre: "pytest", cmd: "python", args: ["-m", "pytest"] }] } }));
      const nombres = async () => (await prepararSiembra({ repo, tarea: "algo", agente: "mentira" })).verificadores.map((v) => v.nombre);
      expect(await nombres()).toContain("pytest");
      await git(["init", "-q"], repo);
      await git(["-c", "user.email=n@e.com", "-c", "user.name=N", "commit", "--allow-empty", "-qm", "base"], repo);
      await sumarProyecto(repo, hogar, { origen: "https://github.com/alguien/repo" });
      expect(await nombres()).not.toContain("pytest");
    } finally {
      if (antes === undefined) delete process.env.DOLPHIN_HOME;
      else process.env.DOLPHIN_HOME = antes;
      await borrarCarpeta(hogar);
    }
  });
});

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });

describe("en la terminal", () => {
  it("la primera vez propone el config, «dale» lo escribe, y no vuelve a preguntar", async () => {
    await mkdir(join(repo, "src"));
    await writeFile(join(repo, "package.json"), JSON.stringify({ name: "x", scripts: { lint: "eslint .", test: "vitest" } }));
    await git(["init", "-q"], repo);
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false });
    await sesion.proponerArranque();
    expect(sesion.mensajes.at(-1)?.texto).toContain("Para probar cada cambio voy a correr: lint › test.");
    expect(sesion.mensajes.at(-1)?.texto).toContain("¿Lo guardo en dolphin.config.json?");
    await sesion.recibir("dale");
    expect(JSON.parse(await readFile(join(repo, "dolphin.config.json"), "utf8"))).toEqual({ terminal: { verificar: ["lint", "test"] } });
    const otra = new Sesion({ repo, agente: "mentira", automatico: false });
    await otra.proponerArranque();
    expect(otra.mensajes).toHaveLength(0);
    sesion.cerrar();
    otra.cerrar();
  });

  it("con «no» no escribe nada, y tampoco vuelve a preguntar", async () => {
    await writeFile(join(repo, "go.mod"), "module x\n");
    const sesion = new Sesion({ repo, agente: "mentira", automatico: false });
    await sesion.proponerArranque();
    await sesion.recibir("no");
    await expect(readFile(join(repo, "dolphin.config.json"), "utf8")).rejects.toThrow();
    const otra = new Sesion({ repo, agente: "mentira", automatico: false });
    await otra.proponerArranque();
    expect(otra.mensajes).toHaveLength(0);
    sesion.cerrar();
    otra.cerrar();
  });
});
