import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { cargarFasesExternas, catalogoDeFases, fasesDeclaradas, lineasDeFases } from "../src/nucleo/fases.js";
import { sumarProyecto } from "../src/nucleo/proyectos.js";
import { prepararSiembra } from "../src/siembra.js";
import type { Universo } from "../src/nucleo/tipos.js";

/**
 * El portón extensible: una fase que escribió otra persona entra al portón como
 * una propia, y nada de lo que haga mal puede romper la siembra.
 *
 * Todo con fases de mentira que viven en `tests/fixtures/`: no se le pregunta
 * nada a ningún modelo.
 */

const correr = promisify(execFile);
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

let repo = "";

/** Una fase del fixture, copiada adentro del repo: afuera del repo no se carga. */
async function ponerFase(archivo: string, como = archivo): Promise<string> {
  await mkdir(join(repo, "fases"), { recursive: true });
  await cp(join(FIXTURES, archivo), join(repo, "fases", como));
  return `./fases/${como}`;
}

const universo = (): Universo => ({ id: "u1", rama: "dolphin/u1", ruta: repo, nacido: 0 });

async function dependencias(mapa: Record<string, string>): Promise<void> {
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "x", dependencias: mapa }));
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-fases-"));
});

afterEach(async () => {
  await borrarCarpeta(repo);
});

describe("una fase de terceros en el portón", () => {
  it("corre como una propia, con el nombre y el costo que declara, y avisa que es código ajeno", async () => {
    const modulo = await ponerFase("fase-licencias.mjs");
    await dependencias({ zod: "MIT" });

    const externas = await cargarFasesExternas(repo, [
      { nombre: "licencias", modulo, queHace: "ninguna dependencia nueva sin licencia permitida", opciones: { permitidas: ["MIT", "ISC"] } },
    ]);

    expect(externas.verificadores.map((v) => `${v.nombre}:${v.costo}`)).toEqual(["licencias:gratis"]);
    expect(externas.fases).toEqual([
      { nombre: "licencias", modulo, de: "repo", queHace: "ninguna dependencia nueva sin licencia permitida", costo: "gratis", enElPorton: true },
    ]);
    expect(externas.avisos[0]).toContain("es código de terceros");
    expect(externas.avisos[0]).toContain("corre con los permisos de Dolphin");

    const veredicto = await externas.verificadores[0]!.correr(universo());
    expect(veredicto).toMatchObject({ paso: true, detalle: "licencias: todas permitidas", gastado: 0 });
    // La procedencia también viaja en la evidencia: ahí la lee quien revisa la rama.
    expect(veredicto.evidencia).toContain("del archivo");
  });

  it("rebota la rama con su motivo, y el motivo es el que escribió la fase", async () => {
    const modulo = await ponerFase("fase-licencias.mjs");
    await dependencias({ "turbo-cosas": "AGPL-3.0" });

    const externas = await cargarFasesExternas(repo, [{ nombre: "licencias", modulo, opciones: { permitidas: ["MIT"] } }]);
    const veredicto = await externas.verificadores[0]!.correr(universo());

    expect(veredicto.paso).toBe(false);
    expect(veredicto.detalle).toBe("licencias: turbo-cosas es AGPL-3.0");
    expect(veredicto.evidencia).toContain("turbo-cosas  AGPL-3.0");
    expect(veredicto.salteada).toBeUndefined();
  });

  it("el escalón lo elige el módulo: una fase barata informa su plata, y un costo inventado cae en gratis", async () => {
    const modulo = await ponerFase("fase-con-costo.mjs");
    const paga = await cargarFasesExternas(repo, [{ nombre: "juez propio", modulo, opciones: { costo: "barato", gastado: 0.02 } }]);
    expect(paga.verificadores[0]!.costo).toBe("barato");
    expect((await paga.verificadores[0]!.correr(universo())).gastado).toBe(0.02);

    const rara = await cargarFasesExternas(repo, [{ nombre: "juez propio", modulo, opciones: { costo: "carísimo", gastado: 3 } }]);
    expect(rara.verificadores[0]!.costo).toBe("gratis");
    expect((await rara.verificadores[0]!.correr(universo())).gastado).toBe(0);
  });

  it("sus opciones salen del config: la misma fase con otra lista deja pasar lo que antes cortaba", async () => {
    const modulo = await ponerFase("fase-licencias.mjs");
    await dependencias({ "turbo-cosas": "AGPL-3.0" });

    const abierta = await cargarFasesExternas(repo, [{ nombre: "licencias", modulo, opciones: { permitidas: ["MIT", "AGPL-3.0"] } }]);
    expect((await abierta.verificadores[0]!.correr(universo())).paso).toBe(true);
  });
});

describe("una fase rota no rompe el portón", () => {
  const motivoDe = async (declarada: unknown) => {
    const externas = await cargarFasesExternas(repo, [declarada]);
    expect(externas.verificadores).toHaveLength(1);
    const veredicto = await externas.verificadores[0]!.correr(universo());
    // Salteada: deja pasar —el código de la rama no tiene la culpa— pero no cuenta como pasada.
    expect(veredicto).toMatchObject({ paso: true, salteada: true, gastado: 0 });
    return veredicto.detalle;
  };

  it("el módulo no existe: se saltea con el motivo, como un comando que no está en la máquina", async () => {
    expect(await motivoDe({ nombre: "licencias", modulo: "./fases/no-esta.mjs" })).toContain("no encontré «./fases/no-esta.mjs» en el repo");
  });

  it("el módulo explota al cargarse: se saltea y se cuenta qué dijo", async () => {
    const modulo = await ponerFase("fase-que-explota.mjs");
    const motivo = await motivoDe({ nombre: "migraciones", modulo });
    expect(motivo).toContain("se rompió al cargarse");
    expect(motivo).toContain("me faltan las tablas de la base");
  });

  it("el módulo no exporta una fábrica: se saltea diciendo justo eso", async () => {
    const modulo = await ponerFase("fase-sin-fabrica.mjs");
    expect(await motivoDe({ nombre: "la mía", modulo })).toContain("no exporta por defecto una función");
  });

  it("un paquete que no está instalado en el repo: se saltea, no se busca más arriba", async () => {
    expect(await motivoDe({ nombre: "auditoría", modulo: "dolphin-fase-auditoria" })).toContain("no está instalado en este repo");
  });

  it("y la siembra se arma igual: la fase rota está en la escalera, salteándose", async () => {
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ porton: { fases: [{ nombre: "licencias", modulo: "./fases/no-esta.mjs" }] } }));
    const preparada = await prepararSiembra({ repo, tarea: "algo", agente: "mentira" });
    expect(preparada.verificadores.map((v) => v.nombre)).toContain("licencias");
    expect(preparada.avisos?.[0]).toContain("no se pudo cargar");
  });
});

describe("qué se le concede a una fase de terceros y qué no", () => {
  it("no se le pasa el repo de la persona, solo el worktree de la rama", async () => {
    const modulo = await ponerFase("fase-atrevida.mjs");
    const externas = await cargarFasesExternas(repo, [{ nombre: "atrevida", modulo }]);
    const veredicto = await externas.verificadores[0]!.correr({ ...universo(), repo, preparado: { pasos: ["npm ci"] } });
    expect(veredicto.detalle).toContain("ni idea");
  });

  it("el nombre lo pone el config: no se puede hacer pasar por «seguridad»", async () => {
    const modulo = await ponerFase("fase-atrevida.mjs");
    const externas = await cargarFasesExternas(repo, [{ nombre: "atrevida", modulo }]);
    expect(externas.verificadores[0]!.nombre).toBe("atrevida");
    expect((await externas.verificadores[0]!.correr(universo())).detalle.startsWith("atrevida:")).toBe(true);
  });

  it("una fase gratis no informa plata —un gasto fantasma falsea «muertos gratis»— ni elige videos", async () => {
    const modulo = await ponerFase("fase-atrevida.mjs");
    const externas = await cargarFasesExternas(repo, [{ nombre: "atrevida", modulo }]);
    const veredicto = await externas.verificadores[0]!.correr(universo());
    expect(veredicto.gastado).toBe(0);
    expect(veredicto.videos).toBeUndefined();
    // El detalle es una línea y entra en una fila: ni saltos ni quinientas equis.
    expect(veredicto.detalle).not.toContain("\n");
    expect(veredicto.detalle.length).toBeLessThanOrEqual(220);
  });

  it("no se carga nada de afuera del repo: ni una ruta que se escapa, ni una URL", async () => {
    const externas = await cargarFasesExternas(repo, [
      { nombre: "escapada", modulo: "../fase.mjs" },
      { nombre: "bajada", modulo: "https://alguien.dev/fase.mjs" },
    ]);
    const motivos = await Promise.all(externas.verificadores.map(async (v) => (await v.correr(universo())).detalle));
    expect(motivos[0]).toContain("cae fuera del repo");
    expect(motivos[1]).toContain("no se baja de internet");
  });

  it("el nombre de una fase propia, o dos veces el mismo, quedan afuera del portón con su motivo", async () => {
    const modulo = await ponerFase("fase-licencias.mjs");
    const externas = await cargarFasesExternas(repo, [
      { nombre: "Seguridad", modulo },
      { nombre: "licencias", modulo },
      { nombre: "licencias", modulo },
      { nombre: "la <b>mía</b>\nde dos renglones", modulo },
    ]);
    expect(externas.fases.map((f) => `${f.nombre}:${f.enElPorton}`)).toEqual(["Seguridad:false", "licencias:true", "licencias:false"]);
    expect(externas.fases[0]!.porQue).toContain("es el nombre de una fase de Dolphin");
    expect(externas.fases[2]!.porQue).toContain("hay dos fases llamadas");
    expect(externas.avisos.filter((a) => a.includes("quedó afuera del portón"))).toHaveLength(2);
  });

  it("una declaración a medias no entra y no tira: ni sin nombre, ni sin módulo, ni nula", () => {
    expect(fasesDeclaradas([{ nombre: "x" }, { modulo: "./x.mjs" }, { nombre: 3, modulo: "./x.mjs" }, null, "x"]).length).toBe(0);
    expect(fasesDeclaradas(undefined)).toEqual([]);
  });

  it("en un repo clonado de afuera no se carga ninguna: su configuración no se ejecuta", async () => {
    const modulo = await ponerFase("fase-licencias.mjs");
    await dependencias({ zod: "MIT" });
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ porton: { fases: [{ nombre: "licencias", modulo }] } }));

    const nombres = async () => (await prepararSiembra({ repo, tarea: "algo", agente: "mentira" })).verificadores.map((v) => v.nombre);
    expect(await nombres()).toContain("licencias");

    await correr("git", ["init", "-q"], { cwd: repo, windowsHide: true });
    await correr("git", ["-c", "user.email=n@e.com", "-c", "user.name=N", "commit", "--allow-empty", "-qm", "base"], { cwd: repo, windowsHide: true });
    await sumarProyecto(repo, process.env.DOLPHIN_HOME, { origen: "https://github.com/alguien/repo" });

    expect(await nombres()).not.toContain("licencias");
    // Y el catálogo lo dice en vez de callarse: la fase existe y no corre.
    const { filas } = await catalogoDeFases(repo);
    expect(filas.find((f) => f.nombre === "licencias")).toMatchObject({ de: "modulo", corre: false, porQue: "el repo vino de afuera: su configuración no se ejecuta" });
  });
});

describe("el catálogo de fases", () => {
  it("junta las de Dolphin, las del repo y las de un módulo, con qué hacen y cuánto cuestan", async () => {
    const modulo = await ponerFase("fase-licencias.mjs");
    await writeFile(join(repo, "package.json"), JSON.stringify({ name: "x", scripts: { typecheck: "tsc", test: "vitest" } }));
    await writeFile(
      join(repo, "dolphin.config.json"),
      JSON.stringify({
        seguridad: false,
        porton: {
          comandos: [{ nombre: "pytest", cmd: "uv", args: ["run", "pytest", "-q"] }],
          fases: [{ nombre: "licencias", modulo, queHace: "ninguna dependencia nueva sin licencia permitida" }],
        },
      }),
    );

    const { filas, avisos } = await catalogoDeFases(repo);
    const por = (nombre: string) => filas.find((f) => f.nombre === nombre);

    expect(por("configuración")).toMatchObject({ de: "dolphin", costo: "gratis", corre: true });
    expect(por("revisión")).toMatchObject({ de: "dolphin", costo: "barato", corre: true });
    // Apagadas en este repo: salen igual, con el motivo al lado.
    expect(por("seguridad")).toMatchObject({ corre: false, porQue: 'salvo "seguridad": false' });
    expect(por("pantalla")?.corre).toBe(false);
    expect(por("typecheck")).toMatchObject({ de: "repo", queHace: "npm run typecheck" });
    expect(por("pytest")).toMatchObject({ de: "repo", queHace: "uv run pytest -q", corre: true });
    expect(por("licencias")).toMatchObject({ de: "modulo", corre: true, queHace: "ninguna dependencia nueva sin licencia permitida" });
    expect(avisos.some((a) => a.includes("código de terceros"))).toBe(true);

    const texto = lineasDeFases(filas, avisos).join("\n");
    expect(texto).toContain("de Dolphin:");
    expect(texto).toContain("del repo:");
    expect(texto).toContain("de un módulo (código de terceros):");
    expect(texto).toContain("✓ corre en este repo");
    expect(texto).toContain("docs/fases.md");
  });

  it("en un repo sin nada, lo dice en vez de inventar un portón", async () => {
    const { filas } = await catalogoDeFases(repo);
    expect(filas.filter((f) => f.de !== "dolphin")).toEqual([]);
    expect(lineasDeFases([])).toContain("  No encontré ninguna fase: ni scripts de npm, ni comandos, ni módulos.");
  });
});
