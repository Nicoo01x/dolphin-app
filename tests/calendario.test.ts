import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  actualizarTurno,
  agendar,
  crearProgramador,
  despuesDeCorrer,
  leerCalendario,
  queToca,
  type Turno,
} from "../src/nucleo/calendario.js";
import { borrarCarpeta } from "./ayuda/borrar.js";
import { esperarA } from "./ayuda/esperar.js";
import { NO_FIRMADO } from "../src/nucleo/firma.js";

/**
 * El calendario: lo que toca se lanza solo, una vez, y lo diario vuelve a
 * mañana a la misma hora sin ponerse al día de golpe.
 */

const turno = (cuando: string, extra: Partial<Turno> = {}): Turno => ({
  id: "t1",
  tareas: ["Sumá el reporte"],
  cuando,
  agente: "mentira",
  estado: "agendado",
  creado: cuando,
  ...extra,
});

describe("qué toca", () => {
  it("solo lo agendado cuya hora ya llegó", () => {
    const ahora = new Date("2026-10-22T09:00:00Z");
    const toca = queToca(
      {
        turnos: [
          turno("2026-10-22T08:59:00Z", { id: "a" }),
          turno("2026-10-22T09:01:00Z", { id: "b" }),
          turno("2026-10-22T08:00:00Z", { id: "c", estado: "corriendo" }),
          turno("2026-10-22T08:00:00Z", { id: "d", estado: "cancelado" }),
        ],
      },
      ahora,
    );
    expect(toca.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("después de correr", () => {
  const ahora = new Date("2026-10-22T09:00:30Z");

  it("uno de una vez queda hecho o falló", () => {
    expect(despuesDeCorrer(turno("2026-10-22T09:00:00Z"), true, ahora).estado).toBe("hecho");
    expect(despuesDeCorrer(turno("2026-10-22T09:00:00Z"), false, ahora, "se cortó en test")).toMatchObject({ estado: "fallo", porQue: "se cortó en test" });
  });

  it("uno diario vuelve a mañana a la misma hora", () => {
    const r = despuesDeCorrer(turno("2026-10-22T09:00:00Z", { repetir: "diario" }), true, ahora);
    expect(r.estado).toBe("agendado");
    expect(r.cuando).toBe("2026-10-23T09:00:00.000Z");
  });

  it("si la máquina estuvo apagada cuatro días, no se pone al día de golpe: va a la próxima hora que no pasó", () => {
    const r = despuesDeCorrer(turno("2026-10-18T09:00:00Z", { repetir: "diario" }), true, ahora);
    expect(r.cuando).toBe("2026-10-23T09:00:00.000Z");
  });

  it("con el cambio de horario, un diario vuelve a SU hora y no se queda corrido una hora", () => {
    const antes = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      // El de las 02:30: el 8/3 esa hora no existe (salta a las 03:00) y corrió a las 03:30.
      const r = despuesDeCorrer(turno("2026-03-08T07:30:00Z", { repetir: "diario", hora: "02:30" }), true, new Date("2026-03-08T07:31:00Z"));
      expect(r.cuando).toBe("2026-03-09T06:30:00.000Z"); // 02:30 otra vez, ya en horario de verano
    } finally {
      if (antes === undefined) delete process.env.TZ;
      else process.env.TZ = antes;
    }
  });

  it("una vuelta que salió no arrastra el porqué ni el parte de la que falló antes", () => {
    const r = despuesDeCorrer(turno("2026-10-22T09:00:00Z", { repetir: "diario", porQue: "se cortó en test", parte: "viejo.html" }), true, ahora);
    expect(r).toMatchObject({ porQue: undefined, parte: undefined, estado: "agendado" });
    expect(r.corridas).toEqual([{ cuando: ahora.toISOString(), salio: true }]);
  });
});

describe("el programador", () => {
  let repo = "";
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "dolphin-calendario-"));
  });
  afterEach(async () => {
    await borrarCarpeta(repo);
  });

  it("agendar valida lo que le mandan", async () => {
    await expect(agendar(repo, { tareas: ["  "], cuando: new Date().toISOString(), agente: "mentira" })).rejects.toThrow("sin tarea");
    await expect(agendar(repo, { tareas: ["x"], cuando: "el jueves", agente: "mentira" })).rejects.toThrow("no entendí cuándo");
  });

  it("lanza lo que toca, una sola vez, y lo marca hecho", async () => {
    const t = await agendar(repo, { tareas: ["Sumá el reporte"], cuando: new Date(Date.now() - 1000).toISOString(), agente: "mentira" });
    await agendar(repo, { tareas: ["Para mañana"], cuando: new Date(Date.now() + 86_400_000).toISOString(), agente: "mentira" });

    const lanzados: string[] = [];
    const programador = crearProgramador(repo, async (turno) => {
      lanzados.push(turno.id);
      return { salio: true };
    }, 60_000);
    try {
      expect((await programador.mirar()).map((x) => x.id)).toEqual([t.id]);
      expect(await programador.mirar()).toEqual([]); // ya está hecho: no se vuelve a lanzar
    } finally {
      programador.detener();
    }
    expect(lanzados).toEqual([t.id]);
    const { turnos } = await leerCalendario(repo);
    expect(turnos.map((x) => x.estado)).toEqual(["hecho", "agendado"]);
  });

  it("de a uno por vez: mientras uno corre, el siguiente espera", async () => {
    const antes = new Date(Date.now() - 1000).toISOString();
    await agendar(repo, { tareas: ["uno"], cuando: antes, agente: "mentira" });
    await agendar(repo, { tareas: ["dos"], cuando: antes, agente: "mentira" });

    let soltar: () => void = () => {};
    const corriendo = new Promise<void>((r) => (soltar = r));
    const programador = crearProgramador(repo, async () => {
      await corriendo;
      return { salio: true };
    }, 60_000);
    try {
      const primero = programador.mirar();
      // Hasta que el primero reclamó el turno: con la máquina cargada no pasa en 50 ms.
      await esperarA(async () => (await leerCalendario(repo)).turnos[0]?.estado === "corriendo");
      expect(await programador.mirar()).toEqual([]); // ocupado
      soltar();
      expect((await primero).length).toBe(1);
      expect((await programador.mirar()).length).toBe(1); // ahora sí, el segundo
    } finally {
      programador.detener();
    }
  });

  it("si lanzar explota, el turno queda en fallo con el motivo y el programador sigue vivo", async () => {
    await agendar(repo, { tareas: ["rompe"], cuando: new Date(Date.now() - 1000).toISOString(), agente: "mentira" });
    const programador = crearProgramador(repo, async () => {
      throw new Error("no hay agente");
    }, 60_000);
    try {
      await programador.mirar();
    } finally {
      programador.detener();
    }
    const [t] = (await leerCalendario(repo)).turnos;
    expect(t).toMatchObject({ estado: "fallo", porQue: "no hay agente" });
  });

  it("un turno que vino escrito en el repo —sin la firma de esta máquina— no corre: queda en fallo con el porqué", async () => {
    // Lo que trae un repo clonado con su `.dolphin/` versionado: un turno vencido.
    await mkdir(join(repo, ".dolphin"), { recursive: true });
    await writeFile(join(repo, ".dolphin", "calendario.json"), JSON.stringify({ turnos: [turno("2020-01-01T00:00:00Z", { id: "ajeno" })] }));
    const lanzados: string[] = [];
    const programador = crearProgramador(repo, async (t) => {
      lanzados.push(t.id);
      return { salio: true };
    }, 60_000);
    try {
      expect(await programador.mirar()).toEqual([]);
    } finally {
      programador.detener();
    }
    expect(lanzados).toEqual([]);
    expect((await leerCalendario(repo)).turnos[0]).toMatchObject({ estado: "fallo", porQue: NO_FIRMADO });
  });

  it("uno firmado al que después le cambiaron la tarea tampoco corre", async () => {
    await agendar(repo, { tareas: ["Sumá el reporte"], cuando: new Date(Date.now() - 1000).toISOString(), agente: "mentira" });
    const ruta = join(repo, ".dolphin", "calendario.json");
    const datos = JSON.parse(await readFile(ruta, "utf8")) as { turnos: Turno[] };
    await writeFile(ruta, JSON.stringify({ turnos: [{ ...datos.turnos[0]!, tareas: ["Borrá todo"] }] }));
    const programador = crearProgramador(repo, async () => ({ salio: true }), 60_000);
    try {
      expect(await programador.mirar()).toEqual([]);
    } finally {
      programador.detener();
    }
    expect((await leerCalendario(repo)).turnos[0]?.estado).toBe("fallo");
  });

  it("cancelar mientras corre lo corta, y el diario queda cancelado: no resucita para mañana", async () => {
    const t = await agendar(repo, { tareas: ["larga"], cuando: new Date(Date.now() - 1000).toISOString(), agente: "mentira", repetir: "diario" });
    let soltar: () => void = () => {};
    let cortado = false;
    const programador = crearProgramador(repo, async (_turno, senal) => {
      senal.addEventListener("abort", () => {
        cortado = true;
        soltar();
      });
      await new Promise<void>((r) => (soltar = r));
      return { salio: false, porQue: "se canceló mientras corría" };
    }, 60_000);
    try {
      const corrida = programador.mirar();
      // Hasta que lo tomó: con la máquina cargada, el reclamo tarda más que un tiempo fijo.
      await esperarA(async () => (await leerCalendario(repo)).turnos[0]?.estado === "corriendo", { tope: 5000 });
      expect((await leerCalendario(repo)).turnos[0]?.estado).toBe("corriendo");
      // Lo que hace la consola al cancelar: el cartel, y cortar el proceso.
      await actualizarTurno(repo, t.id, { estado: "cancelado" });
      expect(programador.cortar(t.id)).toBe(true);
      await corrida;
    } finally {
      programador.detener();
    }
    expect(cortado).toBe(true);
    const [quedo] = (await leerCalendario(repo)).turnos;
    expect(quedo).toMatchObject({ estado: "cancelado", cuando: t.cuando });
    expect(quedo?.corridas).toHaveLength(1);
  });

  it("con dos consolas abiertas el turno sale una vez: el reloj del repo lo tiene la que late", async () => {
    await agendar(repo, { tareas: ["una sola vez"], cuando: new Date(Date.now() - 1000).toISOString(), agente: "mentira" });
    // Otra consola viva —un proceso que existe y no es este— latió recién.
    const reloj = join(repo, ".dolphin", "reloj.json");
    await writeFile(reloj, JSON.stringify({ pid: process.ppid, latido: Date.now() }));
    const lanzados: string[] = [];
    const programador = crearProgramador(repo, async (t) => {
      lanzados.push(t.id);
      return { salio: true };
    }, 60_000);
    try {
      expect(await programador.mirar()).toEqual([]);
      // Dejó de latir hace más de tres vueltas: se cayó, o su pid ahora es de otro programa.
      await writeFile(reloj, JSON.stringify({ pid: process.ppid, latido: Date.now() - 4 * 60_000 }));
      expect(await programador.mirar()).toHaveLength(1);
      expect(JSON.parse(await readFile(reloj, "utf8"))).toMatchObject({ pid: process.pid });
    } finally {
      programador.detener();
    }
    expect(lanzados).toHaveLength(1);
    await expect(readFile(reloj, "utf8")).rejects.toThrow(); // al detenerse lo deja suelto
  });

  it("cancelado desde otra consola: el corte llega por el disco", async () => {
    const t = await agendar(repo, { tareas: ["larga"], cuando: new Date(Date.now() - 1000).toISOString(), agente: "mentira" });
    let cortado = false;
    const programador = crearProgramador(repo, (_turno, senal) =>
      new Promise((listo) => {
        senal.addEventListener("abort", () => {
          cortado = true;
          listo({ salio: false, porQue: "se canceló" });
        });
      }),
    50);
    try {
      const corrida = programador.mirar();
      await esperarA(async () => (await leerCalendario(repo)).turnos[0]?.estado === "corriendo", { tope: 5000 });
      // Solo el cartel, sin `cortar`: es lo que escribe la consola que no lo está corriendo.
      await actualizarTurno(repo, t.id, { estado: "cancelado" });
      await corrida;
    } finally {
      programador.detener();
    }
    expect(cortado).toBe(true);
    expect((await leerCalendario(repo)).turnos[0]?.estado).toBe("cancelado");
  });

  it("uno que quedó «corriendo» por un corte vuelve: el diario a su próxima hora, el de una vez en fallo", async () => {
    const hace = new Date(Date.now() - 3_600_000).toISOString();
    // Un pid que no existe: el proceso que lo corría murió con la máquina.
    const muerto = { estado: "corriendo" as const, corriendoEn: 2_147_483_000 };
    await mkdir(join(repo, ".dolphin"), { recursive: true });
    await writeFile(
      join(repo, ".dolphin", "calendario.json"),
      JSON.stringify({ turnos: [turno(hace, { id: "diario", repetir: "diario", ...muerto }), turno(hace, { id: "una", ...muerto })] }),
    );
    const programador = crearProgramador(repo, async () => ({ salio: true }), 60_000);
    try {
      await programador.mirar();
    } finally {
      programador.detener();
    }
    const [diario, una] = (await leerCalendario(repo)).turnos;
    expect(diario).toMatchObject({ estado: "agendado" });
    expect(new Date(diario!.cuando).getTime()).toBeGreaterThan(Date.now());
    expect(una).toMatchObject({ estado: "fallo" });
    expect(una?.porQue).toContain("se cortó a mitad");
  });
});
