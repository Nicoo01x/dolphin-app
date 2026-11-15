import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { guardarPunto, volverAlPunto } from "../src/nucleo/puntos.js";
import { medirForma } from "../src/nucleo/forma.js";
import { cruzarPorton, type Corrector } from "../src/nucleo/porton.js";
import { sembrarTarea } from "../src/siembra.js";
import { verificadoresDeNpm } from "../src/nucleo/verificadores.js";
import { leerMemoria } from "../src/nucleo/memoria.js";
import type { Agente, Universo, Verificador } from "../src/nucleo/tipos.js";

/**
 * La foto antes de corregir y la vuelta atrás, con git de verdad: lo que
 * cambió vuelve, lo borrado reaparece, lo nuevo se va, lo ignorado no se toca,
 * y HEAD no se entera.
 */

const correr = promisify(execFile);
const git = async (args: string[], cwd: string) => (await correr("git", args, { cwd, windowsHide: true })).stdout.trim();

describe("los puntos de control", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-puntos-"));
    await writeFile(join(repo, "a.js"), "export const a = 1;\n");
    await writeFile(join(repo, "b.js"), "export const b = 2;\n");
    await writeFile(join(repo, ".gitignore"), "node_modules/\n");
    await git(["init", "-q", "-b", "main"], repo);
    await git(["add", "-A"], repo);
    await git(["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"], repo);
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("vuelve todo a como estaba en la foto, sin tocar HEAD ni lo ignorado", async () => {
    // El trabajo del agente antes de corregir: cambia a.js y crea un archivo nuevo.
    await writeFile(join(repo, "a.js"), "export const a = 10;\n");
    await mkdir(join(repo, "src"));
    await writeFile(join(repo, "src", "nuevo.js"), "export const nuevo = true;\n");
    await mkdir(join(repo, "node_modules"));
    await writeFile(join(repo, "node_modules", "dep.js"), "// instalada\n");
    const antes = await medirForma(repo); // deja los nuevos con intent-to-add, como en una siembra
    const head = await git(["rev-parse", "HEAD"], repo);

    const punto = await guardarPunto(repo);

    // La corrección: cambia a.js otra vez, borra b.js, crea otro archivo (con y sin add -N).
    await writeFile(join(repo, "a.js"), "export const a = 99;\n");
    await rm(join(repo, "b.js"));
    await writeFile(join(repo, "lodo.js"), "// de la corrección\n");
    await git(["add", "-N", "lodo.js"], repo);
    await writeFile(join(repo, "suelto.txt"), "sin agregar\n");

    await volverAlPunto(repo, punto);

    // Con core.autocrlf (Windows) git escribe CRLF al volver, como en cualquier
    // checkout: para git es el mismo contenido, y el diff contra HEAD no cambia.
    const leer = async (...ruta: string[]) => (await readFile(join(repo, ...ruta), "utf8")).replace(/\r\n/g, "\n");
    expect(await leer("a.js")).toBe("export const a = 10;\n");
    expect(await leer("b.js")).toBe("export const b = 2;\n");
    expect(await leer("src", "nuevo.js")).toBe("export const nuevo = true;\n");
    expect(existsSync(join(repo, "lodo.js"))).toBe(false);
    expect(existsSync(join(repo, "suelto.txt"))).toBe(false);
    expect(existsSync(join(repo, "node_modules", "dep.js"))).toBe(true);
    expect(await git(["rev-parse", "HEAD"], repo)).toBe(head);
    // Y la forma que se mide después es la misma de antes de la corrección.
    expect(await medirForma(repo)).toEqual(antes);
  });

  it("sacar la foto no cambia nada: ni el índice ni los archivos", async () => {
    await writeFile(join(repo, "a.js"), "export const a = 10;\n");
    const estadoAntes = await git(["status", "--porcelain"], repo);
    await guardarPunto(repo);
    expect(await git(["status", "--porcelain"], repo)).toBe(estadoAntes);
  });
});

describe("el bucle de corrección con puntos de control", () => {
  const universo: Universo = { id: "u1", rama: "dolphin/u1", ruta: "/no/importa", nacido: 0 };
  const reloj = { ahora: () => 0 };

  // Un universo de mentira: dos interruptores que leen las fases.
  const armar = (reintentos: number, conVuelta = true) => {
    const estado = { testOk: true, revisionOk: false };
    const test: Verificador = {
      nombre: "test",
      costo: "gratis",
      async correr() {
        return { paso: estado.testOk, detalle: estado.testOk ? "test: pasó" : "test: se rompió la resta", gastado: 0 };
      },
    };
    const revision: Verificador = {
      nombre: "revisión",
      costo: "barato",
      async correr() {
        return { paso: estado.revisionOk, detalle: estado.revisionOk ? "revisión: bien" : "revisión: falta la nota", gastado: 0.01 };
      },
    };
    const fallas: string[] = [];
    const corrector: Corrector = {
      reintentos,
      // La primera corrección arregla la revisión pero rompe el test; la segunda la arregla bien.
      async corregir(_u, falla) {
        fallas.push(falla.detalle);
        estado.revisionOk = true;
        if (fallas.length === 1) estado.testOk = false;
        return { gastado: 0.02 };
      },
      ...(conVuelta
        ? {
            async guardar() {
              return JSON.stringify(estado);
            },
            async volver(_u: Universo, punto: string) {
              Object.assign(estado, JSON.parse(punto));
            },
          }
        : {}),
    };
    return { estado, test, revision, fallas, corrector };
  };

  it("si la corrección rompe una fase anterior, vuelve a la foto y la próxima vuelta sabe qué no repetir", async () => {
    const { estado, test, revision, fallas, corrector } = armar(2);
    const { candidatos } = await cruzarPorton([universo], [test, revision], reloj, new Map(), undefined, corrector);
    const [c] = candidatos;

    expect(c!.vivo).toBe(true);
    expect(c!.pasadas.map((p) => [p.verificador, p.paso, p.intento ?? 1, p.rotaPor ?? "", p.deshecha ?? false])).toEqual([
      ["test", true, 1, "", false],
      ["revisión", false, 1, "", false],
      ["revisión", true, 2, "", true], // el verde de la corrección que se deshizo: se deshizo con ella
      ["test", false, 1, "revisión", true], // la rompió la corrección, y se deshizo
      ["revisión", true, 3, "", false],
    ]);
    expect(fallas[1]).toContain("la corrección anterior arreglaba esto pero rompía «test»");
    expect(estado).toEqual({ testOk: true, revisionOk: true });
  });

  it("sin más vueltas, se corta en la fase que no salió —no en la que rompió la corrección deshecha— y el universo queda como antes", async () => {
    const { estado, test, revision, corrector } = armar(1);
    const { candidatos } = await cruzarPorton([universo], [test, revision], reloj, new Map(), undefined, corrector);
    const [c] = candidatos;

    expect(c).toMatchObject({ vivo: false, murioEn: "revisión" });
    expect(c!.porQue).toBe("revisión: falta la nota (la corrección que lo arreglaba rompía «test» y se deshizo)");
    expect(estado).toEqual({ testOk: true, revisionOk: false });
  });

  it("sin puntos de control, como siempre: se corta en la fase que rompió la corrección", async () => {
    const { test, revision, corrector } = armar(2, false);
    const { candidatos } = await cruzarPorton([universo], [test, revision], reloj, new Map(), undefined, corrector);
    expect(candidatos[0]).toMatchObject({ vivo: false, murioEn: "test", porQue: "test: se rompió la resta (lo rompió la corrección de «revisión»)" });
  });
});

describe("una siembra de verdad con una corrección que empeora", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-puntos-siembra-"));
    await mkdir(join(repo, "src"));
    await writeFile(join(repo, "package.json"), JSON.stringify({ name: "t", version: "1.0.0", type: "module", scripts: { test: "node --test" } }));
    await writeFile(join(repo, "src", "cuentas.js"), "export const suma = (a, b) => a - b;\nexport const resta = (a, b) => a - b;\n");
    await writeFile(
      join(repo, "src", "cuentas.test.js"),
      'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { suma, resta } from "./cuentas.js";\ntest("suma", () => assert.equal(suma(2, 2), 4));\ntest("resta", () => assert.equal(resta(5, 2), 3));\n',
    );
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
  });

  afterEach(async () => {
    await correr("git", ["worktree", "prune"], { cwd: repo }).catch(() => {});
    await borrarCarpeta(repo);
  });

  it("se vuelve al último verde con git, la rama entregada no arrastra el lodo y la memoria lo anota", async () => {
    // La revisión pide una nota de cambios; los tests vienen primero (gratis).
    const revision: Verificador = {
      nombre: "revisión",
      costo: "barato",
      async correr(u) {
        const hay = existsSync(join(u.ruta, "CAMBIOS.md"));
        return { paso: hay, detalle: hay ? "revisión: bien" : "revisión: falta contar el cambio en CAMBIOS.md", gastado: 0 };
      },
    };
    let vueltas = 0;
    const agente: Agente = {
      nombre: "prueba",
      async trabajar(u) {
        await writeFile(join(u.ruta, "src", "cuentas.js"), "export const suma = (a, b) => a + b;\nexport const resta = (a, b) => a - b;\n");
        return { forma: await medirForma(u.ruta), gastado: 0.01, modelo: "claude-sonnet-5-5" };
      },
      async corregir(u) {
        vueltas += 1;
        await writeFile(join(u.ruta, "CAMBIOS.md"), "La suma suma.\n");
        // La primera vuelta, de paso, «emprolija» la resta y la rompe.
        if (vueltas === 1) await writeFile(join(u.ruta, "src", "cuentas.js"), "export const suma = (a, b) => a + b;\nexport const resta = (a, b) => b - a;\n");
        return { forma: await medirForma(u.ruta), gastado: 0.01 };
      },
    };

    const { cosecha } = await sembrarTarea(
      { repo, tarea: "Arreglá la suma" },
      { agente, verificadores: [...verificadoresDeNpm(["test"]), revision], reparto: { estrategia: "equilibrada", escribir: "sonnet", corregir: "sonnet", revisar: null } },
      { cantidad: 1, reintentos: 2 },
    );

    const [c] = cosecha.candidatos;
    expect(c!.vivo).toBe(true);
    // Lo que rompió la corrección y se deshizo; el verde que había traído también se deshizo, sin rotaPor.
    expect(c!.pasadas.filter((p) => p.deshecha).map((p) => [p.verificador, p.rotaPor])).toEqual([
      ["revisión", undefined],
      ["test", "revisión"],
    ]);
    // Lo entregado es la suma arreglada y la nota, con la resta intacta.
    const entregado = await git(["show", `${cosecha.entregada!.commit}:src/cuentas.js`], repo);
    expect(entregado.replace(/\r\n/g, "\n")).toBe("export const suma = (a, b) => a + b;\nexport const resta = (a, b) => a - b;");
    expect(c!.forma).toMatchObject({ archivos: 2 });

    const { recuerdos } = await leerMemoria(repo);
    expect(recuerdos.map((r) => r.dicho)).toContainEqual(expect.stringContaining("corregir «revisión» rompió «test» y se deshizo"));
  }, 60_000);
});
