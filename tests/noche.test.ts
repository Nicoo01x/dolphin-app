import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { leerBandeja, marcarParaLaNoche, sumarAsuntos } from "../src/nucleo/bandeja.js";
import type { Cosecha } from "../src/nucleo/tipos.js";
import { correrNoche, ESPERA_POR_CUPO, guardarTareaDeLaNoche, horaDeDespertar, pendientesDeLaNoche, type Noche, type PendienteDeLaNoche } from "../src/noche.js";

/**
 * El turno de noche: los pendientes de a uno, cada uno en su rama; sin cupo espera la ventana y
 * retoma la misma tarea; a la hora de despertarse no arranca nada más. Con un reloj de mentira para
 * no esperar de verdad, y una corrida real con el agente de mentira.
 */

const correr = promisify(execFile);
const git = (args: string[], cwd: string) => correr("git", args, { cwd, windowsHide: true });
let repo = "";

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "dolphin-noche-"));
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
  await borrarCarpeta(repo);
});

/** Un reloj que solo avanza cuando alguien espera o cuando la tarea «tarda». */
function reloj(inicio: string) {
  let t = new Date(inicio).getTime();
  return { ahora: () => new Date(t), esperar: async (ms: number) => void (t += ms), pasar: (ms: number) => void (t += ms) };
}

const cosecha = (tarea: string, sale: boolean, porQue = "no pasó el portón"): Cosecha =>
  ({
    tarea,
    candidatos: [{ universo: { id: "u1", rama: `dolphin/x/${tarea}`, ruta: `/tmp/${tarea}`, nacido: 0 }, vivo: sale, pasadas: [{ verificador: "pantalla", paso: true, ms: 1, detalle: "", videos: sale ? [`${tarea}.webm`] : [] }], ...(sale ? {} : { porQue, murioEn: "el agente" }) }],
    ...(sale ? { ganador: { universo: { id: "u1", rama: `dolphin/x/${tarea}`, ruta: `/tmp/${tarea}`, nacido: 0 }, vivo: true, pasadas: [{ verificador: "pantalla", paso: true, ms: 1, detalle: "", videos: [`${tarea}.webm`] }] }, porQueGano: "pasó el portón" } : { porQueGano: porQue }),
    gastado: 0.1,
    muertosGratis: 0,
    ms: 1,
  }) as unknown as Cosecha;

const pendiente = (id: string): PendienteDeLaNoche => ({ id, titulo: id, tarea: id });

describe("la hora de despertarse", () => {
  it("es la próxima vez que el reloj marca esa hora", () => {
    expect(horaDeDespertar("07:00", new Date(2026, 9, 27, 23, 30))).toEqual(new Date(2026, 9, 28, 7, 0));
    expect(horaDeDespertar("7", new Date(2026, 9, 28, 5, 0))).toEqual(new Date(2026, 9, 28, 7, 0));
    expect(horaDeDespertar("25:00", new Date())).toBeNull();
    expect(horaDeDespertar("mañana", new Date())).toBeNull();
  });
});

describe("una noche", () => {
  it("un avance de la noche no pisa una decisión que ya quedó en disco", async () => {
    const noche: Noche = {
      id: "n-decidida",
      repo,
      agente: "mentira",
      desde: "2026-10-27T23:00:00.000Z",
      hasta: "2026-10-28T07:00:00.000Z",
      tareas: [{ id: "a", titulo: "a", tarea: "a", estado: "lista", porQue: "pasó", gastado: 0, esperas: 0, decidida: { accion: "aprobada", en: "2026-10-28T06:30:00.000Z" } }],
    };
    await mkdir(join(repo, ".dolphin", "noches"), { recursive: true });
    const ruta = join(repo, ".dolphin", "noches", `${noche.id}.json`);
    await writeFile(ruta, `${JSON.stringify(noche)}\n`);
    const { decidida: _decidida, ...sinDecision } = noche.tareas[0]!;
    await guardarTareaDeLaNoche(noche, { ...sinDecision, gastado: 0.5 });
    expect(JSON.parse(await readFile(ruta, "utf8")).tareas[0].decidida).toEqual(noche.tareas[0]!.decidida);
  });

  it("hace las tres; la que se queda sin cupo espera la ventana y se retoma", async () => {
    const r = reloj("2026-10-27T23:00:00");
    const llamadas: string[] = [];
    const sembrar = async ({ tarea }: { tarea: string }) => {
      llamadas.push(tarea);
      r.pasar(20 * 60_000);
      if (tarea === "cupones" && llamadas.filter((x) => x === "cupones").length === 1) return cosecha(tarea, false, "Claude AI usage limit reached|1761620400");
      if (tarea === "roto") return cosecha(tarea, false, "test: 2 fallan");
      return cosecha(tarea, true);
    };
    const contado: string[] = [];
    const noche = await correrNoche(
      { repo, agente: "mentira", hasta: new Date("2026-10-28T07:00:00"), pendientes: [pendiente("csv"), pendiente("cupones"), pendiente("roto")] },
      { sembrar, ahora: r.ahora, esperar: r.esperar, contar: (t) => contado.push(t) },
    );
    expect(noche.tareas.map((t) => t.estado)).toEqual(["lista", "lista", "no-salio"]);
    expect(noche.tareas[1]).toMatchObject({ esperas: 1, rama: "dolphin/x/cupones", videos: ["cupones.webm"] });
    expect(noche.tareas[2]!.porQue).toBe("test: 2 fallan");
    expect(llamadas).toEqual(["csv", "cupones", "cupones", "roto"]);
    expect(contado).toContain(`   sin cupo: espero ${ESPERA_POR_CUPO / 60_000} min y retomo esta misma tarea`);
    // Quedó escrita, para el parte de la mañana.
    const [archivo] = await readdir(join(repo, ".dolphin", "noches"));
    expect(JSON.parse(await readFile(join(repo, ".dolphin", "noches", archivo!), "utf8")).tareas).toHaveLength(3);
  });

  it("a la hora de despertarse no arranca nada más, ni sigue esperando cupo", async () => {
    const r = reloj("2026-10-28T06:20:00");
    const sembrar = async ({ tarea }: { tarea: string }) => {
      r.pasar(30 * 60_000);
      return cosecha(tarea, false, "You've hit your limit");
    };
    const noche = await correrNoche({ repo, agente: "mentira", hasta: new Date("2026-10-28T07:00:00"), pendientes: [pendiente("a"), pendiente("b")] }, { sembrar, ahora: r.ahora, esperar: r.esperar });
    expect(noche.tareas.map((t) => t.estado)).toEqual(["sin-cupo", "sin-tiempo"]);
    expect(noche.tareas[1]!.porQue).toBe("se hizo la hora antes de empezarla");
    const [archivo] = await readdir(join(repo, ".dolphin", "noches"));
    expect(JSON.parse(await readFile(join(repo, ".dolphin", "noches", archivo!), "utf8")).tareas[1].porQue).toBe("se hizo la hora antes de empezarla");
  });

  it("toma lo marcado en la bandeja; si lo desmarcaste antes de que llegue, no lo hace", async () => {
    const { sumados } = await sumarAsuntos(repo, [
      { tipo: "idea", titulo: "cupones de descuento", detalle: "que el carrito acepte cupones", origen: "persona" },
      { tipo: "idea", titulo: "modo oscuro", detalle: "un tema oscuro", origen: "persona" },
    ]);
    for (const a of sumados) await marcarParaLaNoche(repo, a.id, "2026-10-27");
    const pendientes = await pendientesDeLaNoche(repo, ["exportar a CSV"]);
    expect(pendientes.map((p) => p.titulo)).toEqual(["cupones de descuento", "modo oscuro", "exportar a CSV"]);
    await marcarParaLaNoche(repo, sumados[1]!.id, undefined);
    const noche = await correrNoche({ repo, agente: "mentira", hasta: new Date(Date.now() + 3_600_000), pendientes }, { sembrar: async ({ tarea }) => cosecha(tarea.slice(0, 10), true) });
    expect(noche.tareas.map((t) => t.estado)).toEqual(["lista", "no-salio", "lista"]);
    expect(noche.tareas[1]!.porQue).toBe("ya no estaba marcada para esta noche");
    expect((await leerBandeja(repo)).asuntos.find((a) => a.id === sumados[0]!.id)?.estado).toBe("implementando");
  });

  it("de punta a punta con el agente de mentira: deja una rama probada por tarea", async () => {
    const noche = await correrNoche({ repo, agente: "mentira", hasta: new Date(Date.now() + 3_600_000), pendientes: [pendiente("exportar a CSV")], verificar: ["sintaxis"] });
    expect(noche.tareas[0]).toMatchObject({ estado: "lista" });
    expect(noche.tareas[0]!.rama).toBeTruthy();
    expect(noche.termino).toBeTruthy();
  }, 60_000);
});
