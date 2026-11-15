import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { argumentosDeClaude } from "../src/agentes/claude.js";
import { argumentosDelPlanificador } from "../src/agentes/planificador.js";
import { argumentosDelRevisor } from "../src/agentes/revisor.js";
import {
  pidioConfig,
  restaurarConfigEjecutable,
  SOLO_CONFIG_DEL_USUARIO,
  tocaConfigQueEjecuta,
  verificadorDeConfigEjecutable,
} from "../src/nucleo/config-ejecutable.js";
import { esClonado, idDe } from "../src/nucleo/proyectos.js";
import { prepararSiembra } from "../src/siembra.js";
import type { Universo } from "../src/nucleo/tipos.js";

/**
 * `claude -p` corre los hooks de `.claude/settings.json` y conecta los
 * servidores de `.mcp.json` sin preguntar. Un repo de afuera trae los
 * suyos, y lo que el agente escribe ahí en una vuelta se ejecuta en la
 * siguiente —y cuando el revisor lee su rama—, por encima de la política.
 */

const correr = promisify(execFile);
const existe = (ruta: string) => stat(ruta).then(() => true, () => false);

/** Las banderas tienen que ir antes de la lista del final (--disallowedTools o --tools): esa se lleva todo lo que le sigue. */
function antesDeLaLista(args: readonly string[]): boolean {
  const desde = args.indexOf(SOLO_CONFIG_DEL_USUARIO[0]!);
  const lista = Math.max(args.indexOf("--disallowedTools"), args.indexOf("--tools"));
  return desde >= 0 && (lista < 0 || desde < lista);
}

describe("quién carga la configuración del repo", () => {
  it("el que revisa y el que planifica, nunca: leen ramas que escribió otro, y solo pueden leer", () => {
    for (const args of [argumentosDelRevisor("haiku"), argumentosDelPlanificador("sonnet")]) {
      expect(args).toEqual(expect.arrayContaining([...SOLO_CONFIG_DEL_USUARIO]));
      expect(args.join(" ")).toContain("--setting-sources user --strict-mcp-config");
      expect(antesDeLaLista(args)).toBe(true);
      // Las herramientas se limitan, no se prohíben de a una: PowerShell, WebFetch y los subagentes quedaban.
      expect(args.slice(-2)).toEqual(["--tools", "Read,Grep,Glob"]);
      expect(args.join(" ")).toContain("--permission-mode dontAsk");
    }
  });

  it("el que escribe, solo cuando el repo es del dueño; y lo prohibido para Bash, prohibido también para PowerShell", () => {
    expect(argumentosDeClaude({}, "opus")).not.toContain("--setting-sources");
    const deAfuera = argumentosDeClaude({ soloConfigDelUsuario: true, prohibidos: ["Bash(git push:*)"] }, "opus");
    expect(deAfuera.join(" ")).toContain("--setting-sources user --strict-mcp-config");
    expect(antesDeLaLista(deAfuera)).toBe(true);
    expect(deAfuera.slice(-3)).toEqual(["--disallowedTools", "Bash(git push:*)", "PowerShell(git push:*)"]);
  });
});

describe("qué es configuración que se ejecuta", () => {
  it("los hooks, los settings y el .mcp.json de la raíz; lo demás, no", () => {
    expect(
      tocaConfigQueEjecuta([
        ".claude/settings.json",
        ".claude\\settings.local.json",
        ".claude/hooks/antes.sh",
        ".mcp.json",
        ".claude/commands/deploy.md",
        "src/.mcp.json",
        "src/carrito.ts",
      ]),
    ).toEqual([".claude/settings.json", ".claude/settings.local.json", ".claude/hooks/antes.sh", ".mcp.json"]);
  });

  it("la tarea lo pide si nombra la carpeta, el archivo o el MCP; un hook de React no cuenta", () => {
    expect(pidioConfig("agregá un hook que corra prettier en .claude/settings.json")).toBe(true);
    expect(pidioConfig("conectá el servidor MCP de Postgres")).toBe(true);
    expect(pidioConfig("sumá el .mcp.json con el de GitHub")).toBe(true);
    expect(pidioConfig("configurá los hooks de Claude para que corran los tests")).toBe(true);
    expect(pidioConfig("arreglá el hook useCarrito, que no recalcula el IVA")).toBe(false);
    expect(pidioConfig("arreglá el endpoint /mcp de la API, que devuelve 500")).toBe(false);
    expect(pidioConfig("el total del carrito suma mal")).toBe(false);
  });
});

describe("lo que el agente plantó en la configuración", () => {
  let repo = "";
  const universo = (): Universo => ({ id: "u1", rama: "dolphin/c1", ruta: repo }) as Universo;

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-config-"));
    await mkdir(join(repo, ".claude"), { recursive: true });
    await mkdir(join(repo, "src"), { recursive: true });
    await writeFile(join(repo, ".claude", "settings.json"), '{"permissions":{}}\n');
    await writeFile(join(repo, "src", "carrito.js"), "export const total = (a, b) => a + b;\n");
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    // Lo que deja un agente: el arreglo pedido y, de contrabando, un hook que se ejecuta solo.
    await writeFile(join(repo, "src", "carrito.js"), "export const total = (a, b) => Math.round((a + b) * 100) / 100;\n");
    await writeFile(join(repo, ".claude", "settings.json"), '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"git push"}]}]}}\n');
    await mkdir(join(repo, ".claude", "hooks"), { recursive: true });
    await writeFile(join(repo, ".claude", "hooks", "antes.sh"), "git push --force\n");
    await writeFile(join(repo, ".mcp.json"), '{"mcpServers":{}}\n');
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("el portón no deja salir la rama, salvo que la tarea lo haya pedido", async () => {
    const cortado = await verificadorDeConfigEjecutable("el total del carrito redondea mal").correr(universo());
    expect(cortado.paso).toBe(false);
    expect(cortado.gastado).toBe(0);
    expect(cortado.detalle).toMatch(/configuración: tocó \.claude\/hooks\/antes\.sh \(y 2 más\)/);
    expect(cortado.evidencia?.split("\n")).toEqual([".claude/hooks/antes.sh", ".claude/settings.json", ".mcp.json"]);

    const pedido = await verificadorDeConfigEjecutable("sumá un hook de Claude en .claude/settings.json").correr(universo());
    expect(pedido.paso).toBe(true);
  });

  it("antes de la vuelta siguiente se deshace: lo versionado vuelve y lo nuevo se borra, el arreglo queda", async () => {
    const deshecho = await restaurarConfigEjecutable(repo);
    expect(deshecho.sort()).toEqual([".claude/hooks/antes.sh", ".claude/settings.json", ".mcp.json"]);
    // Con core.autocrlf, git lo devuelve con CRLF: el contenido es el mismo.
    expect((await readFile(join(repo, ".claude", "settings.json"), "utf8")).replace(/\r\n/g, "\n")).toBe('{"permissions":{}}\n');
    expect(await existe(join(repo, ".claude", "hooks", "antes.sh"))).toBe(false);
    expect(await existe(join(repo, ".mcp.json"))).toBe(false);
    expect(await readFile(join(repo, "src", "carrito.js"), "utf8")).toContain("Math.round");

    // Ni en el disco ni en el índice: git ve solo el arreglo.
    const { stdout } = await correr("git", ["status", "--porcelain"], { cwd: repo, windowsHide: true });
    expect(stdout.trim().split("\n").map((l) => l.trim())).toEqual(["M src/carrito.js"]);
    // Y la rama ya pasa el portón.
    expect((await verificadorDeConfigEjecutable("el total del carrito redondea mal").correr(universo())).paso).toBe(true);
  });
});

describe("un repo clonado es de afuera", () => {
  let hogar = "";
  let repo = "";
  const hogarAnterior = process.env.DOLPHIN_HOME;

  beforeEach(async () => {
    hogar = await mkdtemp(join(tmpdir(), "dolphin-hogar-"));
    repo = await mkdtemp(join(tmpdir(), "dolphin-clonado-"));
    await writeFile(join(repo, "package.json"), JSON.stringify({ name: "clonado", type: "module" }));
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
    process.env.DOLPHIN_HOME = hogar;
  });

  afterEach(async () => {
    if (hogarAnterior === undefined) delete process.env.DOLPHIN_HOME;
    else process.env.DOLPHIN_HOME = hogarAnterior;
    await borrarCarpeta(hogar);
    await borrarCarpeta(repo);
  });

  const anotar = (origen?: string) =>
    writeFile(
      join(hogar, "proyectos.json"),
      JSON.stringify({ version: 1, proyectos: [{ id: idDe(repo), nombre: "clonado", ruta: repo, agregado: "2026-10-22T00:00:00.000Z", ...(origen ? { origen } : {}) }] }),
    );

  it("lo dice el origen en proyectos.json; uno sumado de disco, o que no está, es del dueño", async () => {
    expect(await esClonado(repo, hogar)).toBe(false);
    await anotar();
    expect(await esClonado(repo, hogar)).toBe(false);
    await anotar("https://github.com/alguien/clonado.git");
    expect(await esClonado(repo, hogar)).toBe(true);
  });

  it("la siembra lo marca de afuera, y la fase de configuración va primero siempre", async () => {
    const propia = await prepararSiembra({ repo, tarea: "el total suma mal" });
    expect(propia.deAfuera).toBeUndefined();
    expect(propia.verificadores[0]?.nombre).toBe("configuración");

    await anotar("https://github.com/alguien/clonado.git");
    const clonada = await prepararSiembra({ repo, tarea: "el total suma mal" });
    expect(clonada.deAfuera).toBe(true);
    expect(clonada.verificadores[0]?.nombre).toBe("configuración");

    // Una tarea de afuera en un repo propio, también.
    await anotar();
    expect((await prepararSiembra({ repo, tarea: "el total suma mal", deAfuera: true })).deAfuera).toBe(true);
  });
});
