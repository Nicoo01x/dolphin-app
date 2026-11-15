import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { aislarAgentes, comoCorre, conCaja, cortarCorrida, type Contenedor } from "../src/agentes/ejecutar.js";
import { cajaDisponible, type CajaDeLaRama } from "../src/nucleo/aislado.js";
import { sembrar } from "../src/nucleo/sembrar.js";
import { prepararSiembra } from "../src/siembra.js";
import type { Agente, Forma, Taller } from "../src/nucleo/tipos.js";

/**
 * Dos ramas a la vez no se pisan la caja.
 *
 * El pisotón que esto reproduce: la caja era UNA variable de módulo para todo el proceso
 * (`aislarAgentes`), y `prepararSiembra` la escribe al arrancar cada siembra. Con varias siembras a la
 * vez en el mismo proceso —`dolphin cola --concurrencia 3`, un equipo de compañeros— la última en
 * prepararse le cambiaba la caja a las que ya estaban trabajando, porque `comoCorre` la lee recién al
 * lanzar el proceso: en el turno de corrección, la rama salía con la imagen de otra. Y como
 * `leerConfig` devuelve `{}` ante cualquier error —un `dolphin.config.json` leído a medio escribir
 * alcanza—, una rama podía dejar a las otras corriendo SIN caja, que es justo lo único que el modo
 * aislado promete que no pasa.
 *
 * Nada de esto necesita Docker: se mira el comando con el que cada rama habría corrido.
 */

const entorno = { ANTHROPIC_API_KEY: "sk-ant", PATH: "C:\\Windows" };

const CAJA_DE_A: CajaDeLaRama = { tipo: "docker", config: { imagen: "caja-de-a" } };
const CAJA_DE_B: CajaDeLaRama = { tipo: "podman", config: { imagen: "caja-de-b" } };

/** Cómo habría corrido un turno del agente en ese worktree: con qué caja, qué imagen y qué carpeta. */
function comoCorrio(worktree: string): { cmd: string; imagen?: string; monta?: string } {
  const corre = comoCorre("claude", ["-p"], worktree, entorno);
  const args = [...corre.args];
  return {
    cmd: corre.cmd,
    // Los últimos tres argumentos de la caja son la imagen y el comando del motor.
    ...(args.length > 2 ? { imagen: args.at(-3)! } : {}),
    ...(args.find((a) => a.endsWith(":/trabajo")) ? { monta: args.find((a) => a.endsWith(":/trabajo"))! } : {}),
  };
}

/** Un taller de juguete con la carpeta de SU siembra: así se ve qué worktree monta cada caja. */
const tallerEn = (carpeta: string): Taller => ({
  abrir: async (id, rama) => ({ id, rama: `${rama}/${id}`, ruta: `${carpeta}/${id}`, nacido: 0 }),
  cerrar: async () => {},
});

const FORMA: Forma = { archivos: 1, agregadas: 1, quitadas: 0, dependenciasNuevas: 0 };

/** Una cita entre las ramas: ninguna sigue hasta que llegaron todas. Es lo que fuerza el cruce. */
function cita(cuantas: number): () => Promise<void> {
  let abrir!: () => void;
  const todas = new Promise<void>((listo) => (abrir = listo));
  let faltan = cuantas;
  return () => {
    if (--faltan === 0) abrir();
    return todas;
  };
}

afterEach(() => aislarAgentes(null));

describe("dos ramas en paralelo y la caja de cada una", () => {
  it("cada rama corre de punta a punta en SU caja, aunque la otra prepare la suya en el medio", async () => {
    const llegar = cita(2);
    const turnos = new Map<string, { cmd: string; imagen?: string; monta?: string }[]>();

    /** Un agente que no llama a nadie: anota con qué comando REAL habría corrido cada turno. */
    const agente = (quien: string, laDeLaOtra: CajaDeLaRama): Agente => ({
      nombre: quien,
      async trabajar(universo) {
        const mios = [comoCorrio(universo.ruta)];
        // Mientras esta rama trabaja, la otra siembra prepara la suya. Es exactamente lo que hace
        // prepararAislamiento en siembra.ts, y es lo que antes le cambiaba la caja a esta.
        await llegar();
        aislarAgentes(laDeLaOtra);
        // El segundo turno (una corrección, una retoma) sale después de ese cambio.
        mios.push(comoCorrio(universo.ruta));
        turnos.set(quien, mios);
        return { forma: FORMA, gastado: 0 };
      },
    });

    await Promise.all([
      sembrar({ tarea: "x", cantidad: 1, rama: "dolphin/a", agente: agente("a", CAJA_DE_B), taller: tallerEn("/wt/a"), verificadores: [], caja: CAJA_DE_A }),
      sembrar({ tarea: "x", cantidad: 1, rama: "dolphin/b", agente: agente("b", CAJA_DE_A), taller: tallerEn("/wt/b"), verificadores: [], caja: CAJA_DE_B }),
    ]);

    // Cada rama, sus dos turnos en su caja, con su imagen y montando su worktree y ningún otro.
    expect(turnos.get("a")).toEqual([
      { cmd: "docker", imagen: "caja-de-a", monta: "/wt/a/u1:/trabajo" },
      { cmd: "docker", imagen: "caja-de-a", monta: "/wt/a/u1:/trabajo" },
    ]);
    expect(turnos.get("b")).toEqual([
      { cmd: "podman", imagen: "caja-de-b", monta: "/wt/b/u1:/trabajo" },
      { cmd: "podman", imagen: "caja-de-b", monta: "/wt/b/u1:/trabajo" },
    ]);
  });

  it("una rama sin caja corre afuera aunque el proceso tenga una, y al revés", async () => {
    aislarAgentes({ tipo: "docker", config: { imagen: "la-del-proceso" } });
    // Lo que no es una rama —los bots, «dolphin seguir», un atajo— sigue con la del proceso.
    expect(comoCorrio("/casa")).toMatchObject({ cmd: "docker", imagen: "la-del-proceso" });

    const sinCaja = await sembrar({
      tarea: "x",
      cantidad: 1,
      rama: "dolphin/limpia",
      taller: tallerEn("/wt/limpia"),
      verificadores: [],
      // `null` es una caja también: «esta rama corre afuera». Sin esto, una siembra de un repo que no
      // pidió aislamiento se colaba adentro de la caja del repo que sí lo pidió.
      caja: null,
      agente: {
        nombre: "limpia",
        async trabajar(universo) {
          expect(comoCorrio(universo.ruta)).toEqual({ cmd: "claude" });
          return { forma: FORMA, gastado: 0 };
        },
      },
    });
    expect(sinCaja.candidatos).toHaveLength(1);

    // Y la del proceso quedó donde estaba: la rama no se la llevó.
    expect(comoCorrio("/casa")).toMatchObject({ imagen: "la-del-proceso" });
  });

  it("cortar una rama se lleva SU contenedor y no el de la otra", async () => {
    const contenedores = await Promise.all(
      [CAJA_DE_A, CAJA_DE_B].map((caja, i) =>
        conCaja(caja, async () => comoCorre("claude", ["-p"], `/wt/u${i + 1}`, entorno).contenedor!),
      ),
    );
    const [deA, deB] = contenedores;
    // Un nombre por corrida y la caja de su rama: nadie borra el contenedor del otro por nombre.
    expect(deA!.caja).toBe("docker");
    expect(deB!.caja).toBe("podman");
    expect(deA!.nombre).not.toBe(deB!.nombre);

    const quitados: Contenedor[] = [];
    await cortarCorrida(undefined, deA, async (c) => void quitados.push(c));
    expect(quitados).toEqual([deA]);
  });
});

const correr = promisify(execFile);
const hayCaja = (await cajaDisponible()) !== null;

describe("la caja viaja con la siembra, no con el proceso", () => {
  let repo = "";

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-aislado-paralelo-"));
    await writeFile(join(repo, "leeme.txt"), "hola\n");
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({}));
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], ["-c", "user.email=n@n", "-c", "user.name=n", "commit", "-qm", "base"]]) {
      await correr("git", args, { cwd: repo, windowsHide: true });
    }
  });

  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("prepararSiembra la devuelve: un repo sin «aislado» siembra con caja null, no «la que haya»", async () => {
    const preparada = await prepararSiembra({ repo, tarea: "x", agente: "mentira" });
    expect(preparada.caja).toBeNull();
  });

  it.skipIf(!hayCaja)("con «aislado» en el repo, la preparada trae la caja de la máquina y su imagen", async () => {
    await writeFile(join(repo, "dolphin.config.json"), JSON.stringify({ aislado: { imagen: "dolphin-claude" } }));
    const preparada = await prepararSiembra({ repo, tarea: "x", agente: "mentira" });
    expect(preparada.caja).toMatchObject({ config: { imagen: "dolphin-claude" } });
  });
});
