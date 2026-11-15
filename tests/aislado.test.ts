import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { aislarAgentes, comoCorre } from "../src/agentes/ejecutar.js";
import { doctor } from "../src/doctor.js";
import { BWRAP_SIN_FILTRO, cajaDisponible, comandoAislado, entornoAislado, SIN_CAJA, sinListaDeHosts } from "../src/nucleo/aislado.js";
import { planDe64 } from "../src/nucleo/caja-filtrada.js";
import { prepararSiembra } from "../src/siembra.js";

/**
 * El modo aislado: cómo se arma la caja (solo el worktree, sin red salvo pedirla, sin más secretos que
 * la credencial del motor) y que sin caja el agente no corre. La prueba de punta a punta —un agente
 * aislado que intenta leer el home y salir a la red— necesita Docker, Podman o bubblewrap instalados.
 */

const entorno = {
  ANTHROPIC_API_KEY: "sk-ant-del-motor",
  GITHUB_TOKEN: "ghp_no-tiene-que-entrar",
  AWS_SECRET_ACCESS_KEY: "tampoco",
  HOME: "C:\\Users\\nico",
  PATH: "C:\\Windows",
  LANG: "es_AR.UTF-8",
};

describe("la caja", () => {
  it("adentro solo entra lo básico y la credencial del motor", () => {
    expect(entornoAislado(entorno)).toEqual({ HOME: "/trabajo", PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", ANTHROPIC_API_KEY: "sk-ant-del-motor", LANG: "es_AR.UTF-8" });
  });

  it("Docker: sin red por defecto, el worktree como única carpeta, sin privilegios", () => {
    const { cmd, args } = comandoAislado("docker", { worktree: "D:/tmp/dolphin-x/u1", cmd: "claude", args: ["-p", "hola"], entorno, config: { imagen: "dolphin-claude" } });
    expect(cmd).toBe("docker");
    expect(args.slice(0, 4)).toEqual(["run", "--rm", "-i", "--network"]);
    expect(args[4]).toBe("none");
    expect(args.filter((a) => a === "-v")).toHaveLength(1);
    expect(args).toContain("D:/tmp/dolphin-x/u1:/trabajo");
    expect(args).toContain("ALL");
    expect(args.join(" ")).not.toMatch(/ghp_|AWS_SECRET|C:\\Users/);
    expect(args.slice(-3)).toEqual(["claude", "-p", "hola"]);
    expect(comandoAislado("docker", { worktree: "w", cmd: "c", args: [], entorno, config: { imagen: "i", red: "completa" } }).args[4]).toBe("bridge");
    expect(() => comandoAislado("podman", { worktree: "w", cmd: "c", args: [], entorno })).toThrow("necesita una imagen");
  });

  it("con red, por defecto sale solo a los hosts de su motor: lo lanza Dolphin con su proxy", () => {
    const { cmd, args } = comandoAislado("docker", { worktree: "w", cmd: "claude", args: ["-p"], entorno, config: { imagen: "i", red: true, hosts: ["registry.npmjs.org"] } });
    expect(cmd).not.toBe("docker");
    const plan = planDe64(args.at(-1)!);
    expect(plan.permitidos).toEqual(["api.anthropic.com", "platform.claude.com", "registry.npmjs.org"]);
    expect(plan.claves).toEqual(["ANTHROPIC_API_KEY", "LANG"]);
    // Ni los secretos de afuera ni sus valores viajan en el plan, que se ve en la lista de procesos.
    expect(JSON.stringify(plan)).not.toMatch(/sk-ant|ghp_|AWS_SECRET/);
  });

  it("con red filtrada, un motor sin lista de hosts no corre: lo dice en vez de dar 403 en silencio", () => {
    expect(() => comandoAislado("docker", { worktree: "w", cmd: "agy", args: [], entorno, config: { imagen: "i", red: true } })).toThrow(sinListaDeHosts("agy"));
    // Con los hosts que puso quien lo usa, sí; y con la red completa no hace falta lista.
    const plan = planDe64(comandoAislado("podman", { worktree: "w", cmd: "agy", args: [], entorno, config: { imagen: "i", red: true, hosts: ["*.googleapis.com"] } }).args.at(-1)!);
    expect(plan.permitidos).toEqual(["*.googleapis.com"]);
    expect(comandoAislado("docker", { worktree: "w", cmd: "agy", args: [], entorno, config: { imagen: "i", red: "completa" } }).cmd).toBe("docker");
  });

  it("bubblewrap no puede filtrar: con red filtrada no corre, la completa hay que pedirla", () => {
    expect(() => comandoAislado("bwrap", { worktree: "w", cmd: "c", args: [], entorno, config: { red: true } })).toThrow(BWRAP_SIN_FILTRO);
    expect(comandoAislado("bwrap", { worktree: "w", cmd: "c", args: [], entorno, config: { red: "completa" } }).args).toContain("--share-net");
  });

  it("bubblewrap: todos los espacios de nombres aparte, la red solo si se pide, entorno limpio", () => {
    const { cmd, args } = comandoAislado("bwrap", { worktree: "/home/n/wt", cmd: "claude", args: ["-p"], entorno });
    expect(cmd).toBe("bwrap");
    expect(args).toContain("--unshare-all");
    expect(args).not.toContain("--share-net");
    expect(args.join(" ")).toContain("--bind /home/n/wt /trabajo");
    expect(args).not.toContain("--clearenv");
    expect(args).not.toContain("sk-ant-del-motor");
    expect(args.join(" ")).not.toMatch(/ghp_|AWS_SECRET/);
  });

  it("con la caja puesta, el agente corre adentro, por nombre y no por la ruta de acá", () => {
    aislarAgentes({ tipo: "docker", config: { imagen: "dolphin-claude" } });
    try {
      // La ruta tiene que ser de esta máquina: en Linux una ruta de Windows no es una ruta sino un
      // nombre con barras invertidas (`basename` no las corta), y el CI corre en Linux.
      const rutas = ["/home/nico/.local/bin/claude", ...(process.platform === "win32" ? ["C:\\Users\\nico\\.local\\bin\\claude.exe"] : [])];
      for (const ruta of rutas) {
        const corre = comoCorre(ruta, ["-p"], "D:/tmp/wt", entorno);
        expect(corre.cmd).toBe("docker");
        expect(corre.args.slice(-2)).toEqual(["claude", "-p"]);
      }
    } finally {
      aislarAgentes(null);
    }
    expect(comoCorre("claude", ["-p"], "D:/tmp/wt", entorno)).toEqual({ cmd: "claude", args: ["-p"] });
  });

  it("elige la caja que haya, en orden", async () => {
    expect(await cajaDisponible(async (cmd) => cmd === "podman")).toBe("podman");
    expect(await cajaDisponible(async () => false)).toBeNull();
  });
});

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";
const hayCaja = (await cajaDisponible()) !== null;
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-aislado-"));
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "x" }));
  await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ aislado: { imagen: "dolphin-claude" } }));
  await git(["init", "-q"], repo);
  await git(["config", "user.email", "n@n"], repo);
  await git(["config", "user.name", "n"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});
afterEach(async () => {
  aislarAgentes(null);
  await borrarCarpeta(repo);
});

describe("sin caja, el agente no corre", () => {
  it.skipIf(hayCaja)("pedir el modo aislado sin Docker, Podman ni bubblewrap corta antes de abrir un worktree", async () => {
    await expect(prepararSiembra({ repo, tarea: "x", agente: "mentira" })).rejects.toThrow(SIN_CAJA);
    expect((await git(["worktree", "list"], repo)).stdout.trim().split("\n")).toHaveLength(1);
  });

  it("el doctor lo dice", async () => {
    const h = await doctor(repo, { arreglar: false }, { procesos: async () => [], casa: tmpdir(), temporal: tmpdir(), caja: async () => null });
    expect(h.find((x) => x.que === "modo aislado")?.detalle).toContain("ningún agente va a correr hasta que instales uno");
    const conCaja = await doctor(repo, { arreglar: false }, { procesos: async () => [], casa: tmpdir(), temporal: tmpdir(), caja: async () => "docker" });
    expect(conCaja.some((x) => x.que === "modo aislado")).toBe(false);
  });
});
