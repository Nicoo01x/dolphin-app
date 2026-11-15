import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { motivoDeAprobacion, testsCambiadosDe } from "../src/nucleo/tests-intactos.js";
import type { Cambio } from "../src/nucleo/cambios.js";
import { prepararSiembra, sembrarTarea } from "../src/siembra.js";
import { medirForma } from "../src/nucleo/forma.js";
import { elegir } from "../src/nucleo/elegir.js";
import { crearServidor } from "../src/servidor.js";
import type { Agente, Candidato, Forma } from "../src/nucleo/tipos.js";

/**
 * Ponerse verde cambiando la prueba: se mide, se marca y, con la política
 * estricta, se corta. Sumar tests no es eso.
 */

const correr = promisify(execFile);

describe("qué cuenta como cambiar un test que ya existía", () => {
  it("sacarle o cambiarle líneas, o borrarlo, sí; agregarle casos o sumar uno nuevo, no", () => {
    const cambio = (ruta: string, estado: Cambio["estado"], agregadas: number, quitadas: number): Cambio => ({
      ruta,
      estado,
      agregadas,
      quitadas,
      binario: false,
    });
    const cambios = [
      cambio("src/suma.test.js", "M", 1, 1), // le cambió una línea
      cambio("src/resta.test.js", "M", 6, 0), // solo le agregó casos
      cambio("src/nuevo.test.js", "A", 10, 0), // nuevo
      cambio("tests/viejo.spec.ts", "D", 0, 12), // borrado
      cambio("src/suma.js", "M", 1, 1), // no es un test
      // Renombrado y cambiado: sin renombres, es borrar el viejo y sumar el nuevo. El borrado se ve.
      cambio("tests/a.test.ts", "D", 0, 9),
      cambio("tests/b.test.ts", "A", 6, 0),
    ];
    expect(testsCambiadosDe(cambios)).toEqual([
      { ruta: "src/suma.test.js", quitadas: 1 },
      { ruta: "tests/viejo.spec.ts", quitadas: 12, borrado: true },
      { ruta: "tests/a.test.ts", quitadas: 9, borrado: true },
    ]);
  });
});

describe("al elegir entre las que pasaron", () => {
  const candidato = (id: string, forma: Forma): Candidato => ({
    universo: { id, rama: `dolphin/x/${id}`, ruta: `/tmp/${id}`, nacido: 0 },
    vivo: true,
    pasadas: [{ verificador: "test", costo: "barato", paso: true, detalle: "ok", gastado: 0, ms: 1 }],
    forma,
  });

  it("la que cambió la prueba pierde aunque sea la más simple y la primera", () => {
    // u1 «arregla» en una línea cambiando el test; u2 arregla el código en dos archivos.
    const tramposa = candidato("u1", { archivos: 1, agregadas: 1, quitadas: 1, dependenciasNuevas: 0, testsCambiados: [{ ruta: "src/suma.test.js", quitadas: 1 }] });
    const honesta = candidato("u2", { archivos: 2, agregadas: 6, quitadas: 2, dependenciasNuevas: 0, testsCambiados: [] });
    const { ganador, porQue } = elegir([tramposa, honesta]);
    expect(ganador?.universo.id).toBe("u2");
    expect(porQue).toBe("Pasaron 2. La rama 2 dejó intactas las pruebas que ya existían y la rama 1 las cambió.");
  });

  it("si todas cambiaron pruebas (la tarea era de tests), vuelve a ganar la más simple", () => {
    const cambio = [{ ruta: "src/suma.test.js", quitadas: 3 }];
    const a = candidato("u1", { archivos: 3, agregadas: 9, quitadas: 3, dependenciasNuevas: 0, testsCambiados: cambio });
    const b = candidato("u2", { archivos: 1, agregadas: 2, quitadas: 3, dependenciasNuevas: 0, testsCambiados: cambio });
    expect(elegir([a, b]).ganador?.universo.id).toBe("u2");
  });

  it("una cosecha vieja que no lo medía no acusa a nadie", () => {
    const vieja = candidato("u1", { archivos: 1, agregadas: 1, quitadas: 0, dependenciasNuevas: 0 });
    const nueva = candidato("u2", { archivos: 2, agregadas: 1, quitadas: 0, dependenciasNuevas: 0, testsCambiados: [] });
    expect(elegir([vieja, nueva]).ganador?.universo.id).toBe("u1");
  });
});

describe("la política «aprobar»", () => {
  const conCambio = { forma: { testsCambiados: [{ ruta: "src/suma.test.js", quitadas: 1 }] } };

  it("pide aprobación solo con esa política y solo si cambió pruebas", () => {
    expect(motivoDeAprobacion("aprobar", conCambio)).toBe("cambió pruebas que ya existían — src/suma.test.js (−1)");
    expect(motivoDeAprobacion("avisar", conCambio)).toBeNull();
    expect(motivoDeAprobacion(undefined, conCambio)).toBeNull();
    expect(motivoDeAprobacion("aprobar", { forma: { testsCambiados: [] } })).toBeNull();
    expect(motivoDeAprobacion("aprobar", undefined)).toBeNull();
  });
});

describe("una rama que se pone verde tocando la prueba", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-tests-intactos-"));
    await mkdir(join(repo, "src"));
    await writeFile(join(repo, "package.json"), JSON.stringify({ name: "t", version: "1.0.0", type: "module", scripts: { test: "node --test" } }));
    // El bug: resta en vez de sumar. El test que lo prueba ya existe.
    await writeFile(join(repo, "src", "suma.js"), "export const suma = (a, b) => a - b;\n");
    await writeFile(
      join(repo, "src", "suma.test.js"),
      'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { suma } from "./suma.js";\ntest("suma", () => assert.equal(suma(2, 2), 4));\n',
    );
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
  });

  afterEach(async () => {
    await correr("git", ["worktree", "prune"], { cwd: repo }).catch(() => {});
    await borrarCarpeta(repo);
  });

  // u1 arregla el código; u2 «arregla» la prueba para que espere lo que da el bug.
  const agente: Agente = {
    nombre: "prueba",
    async trabajar(universo) {
      if (universo.id === "u1") {
        await writeFile(join(universo.ruta, "src", "suma.js"), "export const suma = (a, b) => a + b;\n");
      } else {
        await writeFile(
          join(universo.ruta, "src", "suma.test.js"),
          'import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { suma } from "./suma.js";\ntest("suma", () => assert.equal(suma(2, 2), 0));\n',
        );
      }
      return { forma: await medirForma(universo.ruta), gastado: 0 };
    },
  };

  it("sin política, pasa pero queda marcada: la consola avisa", async () => {
    const preparada = await prepararSiembra({ repo, tarea: "arreglá la suma", verificar: ["test"] });
    const { cosecha } = await sembrarTarea({ repo, tarea: "arreglá la suma" }, { ...preparada, agente }, { cantidad: 2 });

    const [u1, u2] = cosecha.candidatos;
    expect(u1!.vivo).toBe(true);
    expect(u1!.forma?.testsCambiados).toEqual([]);
    expect(u2!.vivo).toBe(true); // los tests pasan: por eso hace falta marcarla
    expect(u2!.forma?.testsCambiados).toEqual([{ ruta: "src/suma.test.js", quitadas: 1, asercionesQuitadas: 1 }]);
  }, 60_000);

  it("con la política estricta, la tramposa se corta antes de correr los tests, y gana la honesta", async () => {
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ testsExistentes: "cortar" }));
    const preparada = await prepararSiembra({ repo, tarea: "arreglá la suma", verificar: ["test"] });
    expect(preparada.verificadores.map((v) => v.nombre)).toEqual(["configuración", "tests intactos", "seguridad", "test"]);

    const { cosecha } = await sembrarTarea({ repo, tarea: "arreglá la suma" }, { ...preparada, agente }, { cantidad: 2, reintentos: 0 });
    const [u1, u2] = cosecha.candidatos;
    expect(u1!.vivo).toBe(true);
    expect(u2).toMatchObject({ vivo: false, murioEn: "tests intactos" });
    expect(u2!.porQue).toContain("cambió pruebas que ya existían — src/suma.test.js (−1)");
    // Se cortó gratis, sin llegar a correr los tests.
    expect(u2!.pasadas.map((p) => p.verificador)).toEqual(["configuración", "tests intactos"]);
    expect(cosecha.ganador?.universo.id).toBe("u1");
  }, 60_000);

  it("con la política «aprobar», mergear la tramposa exige el sí; con el sí, se mergea", async () => {
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ testsExistentes: "aprobar" }));
    await correr("git", ["add", "-A"], { cwd: repo });
    await correr("git", ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "politica"], { cwd: repo });
    await correr("git", ["config", "user.email", "n@n"], { cwd: repo });
    await correr("git", ["config", "user.name", "n"], { cwd: repo });

    // Una sola rama, la tramposa: pasa, gana y se entrega.
    const soloTramposa: Agente = { ...agente, trabajar: (u, ...r) => agente.trabajar({ ...u, id: "u2" }, ...r) };
    const preparada = await prepararSiembra({ repo, tarea: "arreglá la suma", verificar: ["test"] });
    expect(preparada.verificadores.map((v) => v.nombre)).toEqual(["configuración", "seguridad", "test"]); // «aprobar» no corta
    const { cosecha } = await sembrarTarea({ repo, tarea: "arreglá la suma" }, { ...preparada, agente: soloTramposa }, { cantidad: 1 });
    expect(cosecha.entregada).toBeDefined();

    const servidor = crearServidor({ repo, calendario: false });
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    try {
      const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
      const r = await (await fetch(`${base}/api/cosecha`)).json();
      expect(r.pideAprobacion).toBe("cambió pruebas que ya existían — src/suma.test.js (−1); sacó 1 expect/assert");

      const token = /name="dolphin-token" content="([0-9a-f]+)"/.exec(await (await fetch(`${base}/`)).text())?.[1];
      if (!token) return;
      const mandar = (cuerpo: unknown) =>
        fetch(`${base}/api/rama`, { method: "POST", headers: { "content-type": "application/json", "x-dolphin-token": token }, body: JSON.stringify(cuerpo) });

      const sinSi = await mandar({ accion: "mergear", id: null });
      expect(sinSi.status).toBe(409);
      expect(await sinSi.json()).toMatchObject({ ok: false, pideAprobacion: "cambió pruebas que ya existían — src/suma.test.js (−1); sacó 1 expect/assert" });

      const conSi = await mandar({ accion: "mergear", id: null, aprobado: true });
      expect(conSi.status).toBe(200);
      expect((await conSi.json()).estadoRama).toBe("mergeada");
    } finally {
      await new Promise((listo) => servidor.close(listo));
    }
  }, 60_000);
});
