import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { correrOraculo, pedidoConOraculo, porQueDelOraculo, separarOraculo } from "../src/nucleo/oraculo.js";
import { Sesion } from "../src/tui/sesion.js";

/**
 * El oráculo de /objetivo: un comando tuyo decide si quedó logrado. Mientras no pase, no está
 * logrado, y lo que imprimió es la pista del intento siguiente. Con git de verdad y el agente de
 * mentira: no gasta nada.
 */

describe("leer el oráculo de lo que escribió la persona", () => {
  it("separa el objetivo del comando, con o sin tilde y comillas", () => {
    expect(separarOraculo("que lea CSV --oraculo npm test -- csv")).toEqual({ objetivo: "que lea CSV", oraculo: "npm test -- csv" });
    expect(separarOraculo("que lea CSV --oráculo `node verificar.js`")).toEqual({ objetivo: "que lea CSV", oraculo: "node verificar.js" });
    expect(separarOraculo("que lea CSV")).toEqual({ objetivo: "que lea CSV" });
  });

  it("el equipo sabe desde el principio con qué se lo va a juzgar", () => {
    expect(pedidoConOraculo("x")).toBe("x");
    expect(pedidoConOraculo("x", "npm test")).toContain("sale en 0: `npm test`");
  });
});

describe("correr el oráculo", () => {
  it("pasa con 0, no pasa con otra cosa y se queda con lo último que imprimió", async () => {
    const bien = await correrOraculo(`node -e "console.log('3 casos pasan')"`, tmpdir());
    expect(bien).toMatchObject({ paso: true, salida: "3 casos pasan" });
    const mal = await correrOraculo(`node -e "console.log('uno'); console.error('falta el caso vacío'); process.exit(2)"`, tmpdir());
    expect(mal.paso).toBe(false);
    expect(porQueDelOraculo(mal).split("\n")[0]).toBe("el oráculo no pasó: falta el caso vacío");
  });

  it("un comando que no termina se corta y no pasa", async () => {
    const v = await correrOraculo(`node -e "setTimeout(() => {}, 60000)"`, tmpdir(), 500);
    expect(v.paso).toBe(false);
    expect(v.salida).toContain("se cortó");
  });

  it("al llegar al tope mata también un hijo del shell", async () => {
    const marca = join(tmpdir(), `dolphin-oraculo-hijo-${Date.now()}.txt`);
    const script = join(tmpdir(), `dolphin-oraculo-padre-${Date.now()}.cjs`);
    await writeFile(script, `require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(`setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marca)}, "vivo"), 700)`) }], { stdio: "ignore" });\n`);
    try {
      await correrOraculo(`node "${script}"`, tmpdir(), 100);
      await new Promise((r) => setTimeout(r, 900));
      expect(existsSync(marca)).toBe(false);
    } finally {
      await rm(script, { force: true });
      await rm(marca, { force: true });
    }
  });
});

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";
let afuera = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-oraculo-"));
  afuera = await mkdtemp(join(tmpdir(), "dolphin-oraculo-afuera-"));
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "tienda", type: "module", scripts: { sintaxis: "node --check src/a.js" } }));
  await writeFile(join(repo, "src", "a.js"), "export const suma = (a, b) => a + b\n");
  await git(["init", "-q"], repo);
  await git(["config", "user.email", "nico@ejemplo.com"], repo);
  await git(["config", "user.name", "Nico"], repo);
  await git(["add", "-A"], repo);
  await git(["commit", "-qm", "base"], repo);
});
afterEach(async () => {
  await git(["worktree", "prune"], repo).catch(() => {});
  await Promise.all([repo, afuera].map((r) => borrarCarpeta(r)));
});

describe("/objetivo con oráculo, de punta a punta", () => {
  it("no da por logrado lo que el oráculo rechaza: falla dos veces, pasa a la tercera y guarda la evidencia", async () => {
    // Un oráculo con memoria afuera del repo: las dos primeras veces falta un caso distinto (hay progreso), la tercera pasa.
    const contador = join(afuera, "veces.txt");
    const script = join(afuera, "oraculo.cjs");
    await writeFile(
      script,
      [
        "const fs = require('fs');",
        `const f = ${JSON.stringify(contador)};`,
        "const n = (fs.existsSync(f) ? Number(fs.readFileSync(f, 'utf8')) : 0) + 1;",
        "fs.writeFileSync(f, String(n));",
        "if (n === 1) { console.log('falta el caso del cupón vencido'); process.exit(1); }",
        "if (n === 2) { console.log('falta el caso del monto en cero'); process.exit(1); }",
        "console.log('todos los casos pasan');",
      ].join("\n"),
    );
    const sesion = new Sesion({ repo, agente: "mentira", automatico: true, verificar: ["sintaxis"] });
    await sesion.recibir(`/objetivo aceptar cupones --oraculo node "${script}"`);
    const textos = sesion.mensajes.map((m) => m.texto);
    expect(textos.filter((t) => t.startsWith("El oráculo no pasó"))).toHaveLength(2);
    expect(textos.at(-1)).toMatch(/^Lo logré en 3 intentos: dolphin-equipo\/.+ El oráculo pasó/s);
    expect(textos.at(-1)).toContain("todos los casos pasan");
    // El tercer intento llevó lo que dijo el oráculo en los anteriores.
    expect(sesion.equipo?.objetivo).toContain("el oráculo no pasó: falta el caso del monto en cero");
    expect(sesion.equipo?.objetivo).toContain("sale en 0");

    const carpeta = join(repo, ".dolphin", "objetivos");
    const [archivo] = await readdir(carpeta);
    const evidencia = JSON.parse(await readFile(join(carpeta, archivo!), "utf8"));
    expect(evidencia).toMatchObject({ objetivo: "aceptar cupones", logrado: true });
    expect(evidencia.veredictos.map((v: { paso: boolean }) => v.paso)).toEqual([false, false, true]);
    expect(evidencia.intentos).toHaveLength(3);
    sesion.cerrar();
  }, 300_000);
});
