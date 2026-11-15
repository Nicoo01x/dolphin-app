import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { carpetaDeDolphin, enFila, escribirDeUna, leerEstado } from "./escritura.js";
import { firmar, firmaValida, llaveDeFirma, NO_FIRMADO } from "./firma.js";
import { procesoVivo } from "../agentes/ejecutar.js";
import type { Host } from "./ssh.js";
import type { Motor } from "./router.js";

/**
 * El calendario: anotás «mañana 09:00 → tal tarea» y Dolphin la lanza solo
 * a esa hora —corriendo solo, con la política encima— y deja el parte.
 *
 * Un turno es una tarea (o varias, que van a la cola) con un cuándo: una
 * vez, o todos los días a una hora. El que mira la hora es el servidor de
 * Dolphin, el proceso que queda prendido; esta parte solo decide qué toca.
 */

export type EstadoDeTurno = "agendado" | "corriendo" | "hecho" | "fallo" | "cancelado";

/** Una vuelta de un turno: un diario vuelve a «agendado» y sin esto no quedaba rastro de cómo le fue. */
export interface CorridaDeTurno {
  readonly cuando: string;
  readonly salio: boolean;
  readonly porQue?: string;
  readonly parte?: string;
}

export interface PausaDeCupo {
  readonly hasta: string;
  readonly ventana: "5h" | "semana";
  readonly usadoPct: number;
}

export interface Turno {
  readonly id: string;
  /** Una tarea sola, o varias para la cola. */
  readonly tareas: readonly string[];
  /** Si está presente, el turno elige asuntos aprobados de la bandeja. */
  readonly deLaBandeja?: { readonly tope: number };
  /** Cuándo corre la próxima vez (ISO). */
  readonly cuando: string;
  /** Si se repite: todos los días a la misma hora. */
  readonly repetir?: "diario";
  /**
   * La hora pedida de un diario, «HH:MM» de esta máquina. Sumar un día al
   * `cuando` corría el turno una hora para siempre después del cambio de
   * horario: el de las 02:30 pasaba a las 03:30 y se quedaba ahí.
   */
  readonly hora?: string;
  readonly agente: Motor;
  readonly modelo?: string;
  /** Dónde corre: esta máquina, o un host por SSH (ver ssh.ts). */
  readonly host?: string;
  /**
   * La máquina de ese host tal como estaba al agendar, firmada con el resto.
   * Antes se firmaba solo el nombre y el destino se leía del
   * dolphin.config.json del repo al correr: un `git pull` que cambiara
   * adónde apunta «vps» mandaba a otro lado un turno ya agendado.
   */
  readonly maquina?: Host;
  readonly estado: EstadoDeTurno;
  readonly creado: string;
  readonly corrio?: string;
  /** El parte de la última corrida, en .dolphin/partes/. */
  readonly parte?: string;
  readonly porQue?: string;
  /** Las últimas vueltas, la más nueva al final. */
  readonly corridas?: readonly CorridaDeTurno[];
  /** Mientras espera el reinicio del cupo, para que la consola lo muestre. */
  readonly pausaCupo?: PausaDeCupo;
  /** El proceso que lo está corriendo: un «corriendo» sin ese proceso vivo es de un corte. */
  readonly corriendoEn?: number;
  /** La firma de la consola que lo agendó (ver firma.ts): sin ella no corre. */
  readonly firma?: string;
}

export interface Calendario {
  readonly turnos: readonly Turno[];
}

/** Un cambio a un turno. Un campo en `undefined` se borra: «salió bien» no arrastra el porqué de la falla anterior. */
export type CambioDeTurno = { readonly [K in keyof Turno]?: Turno[K] | undefined };

/** Cuántas vueltas se guardan por turno: lo justo para la actividad, no un historial infinito. */
const CORRIDAS = 10;

const rutaCalendario = (repo: string) => join(repo, ".dolphin", "calendario.json");

export function leerCalendario(repo: string): Promise<Calendario> {
  return leerEstado(rutaCalendario(repo), { turnos: [] }, (datos) => {
    const turnos = (datos as Partial<Calendario> | null)?.turnos;
    return { turnos: Array.isArray(turnos) ? turnos : [] };
  });
}

// De una sola vez y en fila (ver escritura.ts): la agenda se relee mientras el programador la cambia.
async function guardarCalendario(repo: string, calendario: Calendario): Promise<void> {
  await carpetaDeDolphin(repo);
  await escribirDeUna(rutaCalendario(repo), `${JSON.stringify(calendario, null, 2)}\n`);
}

export type TurnoNuevo = Pick<Turno, "tareas" | "cuando" | "agente"> & Partial<Pick<Turno, "repetir" | "modelo" | "host" | "maquina" | "deLaBandeja" | "hora">>;

/**
 * Lo que se firma de un turno: qué corre, con qué y dónde. El estado y el
 * cuándo no, que cambian solos. La máquina, solo si la hay (un turno de
 * antes sigue valiendo) y con sus campos en un orden fijo.
 */
const firmable = (t: Turno) => ({
  id: t.id,
  tareas: t.tareas,
  deLaBandeja: t.deLaBandeja,
  agente: t.agente,
  modelo: t.modelo,
  host: t.host,
  repetir: t.repetir,
  hora: t.hora,
  ...(t.maquina ? { maquina: { destino: t.maquina.destino, repo: t.maquina.repo, dolphin: t.maquina.dolphin } } : {}),
});

const dosCifras = (n: number) => String(n).padStart(2, "0");

export async function agendar(repo: string, nuevo: TurnoNuevo): Promise<Turno> {
  const tareas = nuevo.tareas.map((t) => t.trim()).filter((t) => t !== "");
  if (nuevo.deLaBandeja) {
    if (!Number.isInteger(nuevo.deLaBandeja.tope) || nuevo.deLaBandeja.tope < 1 || nuevo.deLaBandeja.tope > 5)
      throw new Error("el tope de la bandeja va de 1 a 5");
  } else if (tareas.length === 0) throw new Error("un turno sin tarea no tiene nada que hacer");
  const cuando = new Date(nuevo.cuando);
  if (Number.isNaN(cuando.getTime())) throw new Error("no entendí cuándo: mandá una fecha y hora");
  if (nuevo.host && !nuevo.maquina) throw new Error(`no hay un host «${nuevo.host}» en dolphin.config.json`);

  const sinFirma: Turno = {
    id: `c${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    tareas,
    ...(nuevo.deLaBandeja ? { deLaBandeja: nuevo.deLaBandeja } : {}),
    cuando: cuando.toISOString(),
    agente: nuevo.agente,
    ...(nuevo.repetir ? { repetir: nuevo.repetir, hora: nuevo.hora ?? `${dosCifras(cuando.getHours())}:${dosCifras(cuando.getMinutes())}` } : {}),
    ...(nuevo.modelo ? { modelo: nuevo.modelo } : {}),
    ...(nuevo.host && nuevo.maquina ? { host: nuevo.host, maquina: nuevo.maquina } : {}),
    estado: "agendado",
    creado: new Date().toISOString(),
  };
  const turno: Turno = { ...sinFirma, firma: firmar(await llaveDeFirma(), firmable(sinFirma)) };
  await enFila(rutaCalendario(repo), async () => {
    const calendario = await leerCalendario(repo);
    await guardarCalendario(repo, { turnos: [...calendario.turnos, turno] });
  });
  return turno;
}

/**
 * Cambia un turno sobre lo que hay en disco, en fila. Con una función, el
 * cambio se decide mirando el turno de AHORA —no el que se leyó antes de
 * correrlo—, y si devuelve `null` no se toca: así un «cancelado» que llegó
 * mientras corría no lo pisa el final de la corrida.
 */
export function actualizarTurno(
  repo: string,
  id: string,
  cambio: CambioDeTurno | ((actual: Turno) => CambioDeTurno | null),
): Promise<Turno | null> {
  return enFila(rutaCalendario(repo), async () => {
    const calendario = await leerCalendario(repo);
    const i = calendario.turnos.findIndex((t) => t.id === id);
    if (i < 0) return null;
    const actual = calendario.turnos[i]!;
    const queCambia = typeof cambio === "function" ? cambio(actual) : cambio;
    if (queCambia === null) return null;
    const nuevo = { ...actual, ...queCambia } as Record<string, unknown>;
    for (const [k, v] of Object.entries(nuevo)) if (v === undefined) delete nuevo[k];
    const turnos = [...calendario.turnos];
    turnos[i] = nuevo as unknown as Turno;
    await guardarCalendario(repo, { turnos });
    return turnos[i]!;
  });
}

/** Los turnos a los que les llegó la hora. Uno corriendo no se vuelve a lanzar. */
export function queToca(calendario: Calendario, ahora: Date): Turno[] {
  return calendario.turnos.filter((t) => t.estado === "agendado" && new Date(t.cuando).getTime() <= ahora.getTime());
}

/** El próximo cuándo de un diario: el primero que todavía no pasó, a su hora pedida si la tiene. */
function proximoDiario(turno: Turno, ahora: Date): string {
  const proximo = new Date(turno.cuando);
  const [h, m] = (turno.hora ?? "").split(":").map(Number);
  const conHora = turno.hora !== undefined && Number.isInteger(h) && Number.isInteger(m);
  // Si la máquina estuvo apagada varios días, no se ponen al día de golpe:
  // la próxima es la primera hora que todavía no pasó.
  while (proximo.getTime() <= ahora.getTime()) {
    proximo.setDate(proximo.getDate() + 1);
    if (conHora) proximo.setHours(h!, m!, 0, 0);
  }
  return proximo.toISOString();
}

/** Después de correr: uno de una vez queda hecho; uno diario se re-agenda para mañana a la misma hora. */
export function despuesDeCorrer(turno: Turno, salio: boolean, ahora: Date, porQue?: string, parte?: string): CambioDeTurno {
  const corrio = ahora.toISOString();
  const corridas = [...(turno.corridas ?? []), { cuando: corrio, salio, ...(porQue ? { porQue } : {}), ...(parte ? { parte } : {}) }].slice(-CORRIDAS);
  // El porqué y el parte son de ESTA vuelta: los de la anterior no se arrastran.
  const deEstaVuelta = { corrio, corridas, porQue, parte, corriendoEn: undefined, pausaCupo: undefined };
  if (turno.repetir === "diario") return { ...deEstaVuelta, estado: "agendado", cuando: proximoDiario(turno, ahora) };
  return { ...deEstaVuelta, estado: salio ? "hecho" : "fallo" };
}

/**
 * Si salió un turno: lo dice lo que dejó, no el código de salida (una
 * siembra sin ninguna rama probada termina bien y no salió). Una sola regla
 * para lo que corre acá y lo que corre en un VPS por SSH: `desde` es cuándo
 * arrancó, con el reloj de la máquina donde corrió, y lo de antes es de otra
 * corrida —un turno que no dejó nada no se da por bueno con la cosecha de ayer—.
 */
export function salioElTurno(
  varias: boolean,
  dejo: {
    readonly tareas?: readonly { readonly creada: string; readonly estado: string }[];
    readonly cosecha?: { readonly cuando?: string; readonly ganador?: unknown; readonly porQueGano?: string; readonly parte?: string } | null | undefined;
  },
  desde: string,
): { salio: boolean; porQue?: string; parte?: string } {
  if (varias) {
    const estas = (dejo.tareas ?? []).filter((t) => t.creada >= desde);
    const listas = estas.filter((t) => t.estado === "lista").length;
    return listas === estas.length && estas.length > 0 ? { salio: true } : { salio: false, porQue: `${listas} de ${estas.length} tareas quedaron listas` };
  }
  const cosecha = dejo.cosecha;
  if (!cosecha || (cosecha.cuando ?? "") < desde) return { salio: false, porQue: "la siembra no dejó cosecha" };
  // El parte viaja con el turno: es lo que la Agenda ofrece abrir.
  const parte = cosecha.parte ? { parte: cosecha.parte } : {};
  return cosecha.ganador ? { salio: true, ...parte } : { salio: false, porQue: cosecha.porQueGano ?? "ninguna rama pasó el portón", ...parte };
}

/**
 * Los turnos que quedaron «corriendo» por un corte —la máquina se apagó, se
 * cerró la consola— no los iba a correr nunca nadie: `queToca` solo mira
 * los agendados. Al arrancar, uno diario vuelve a su próxima hora y uno de
 * una vez queda en fallo, los dos con el porqué.
 */
async function rescatarCortados(repo: string, ahora: Date): Promise<void> {
  const PORQUE = "se cortó a mitad: la máquina se apagó o se cerró la consola mientras corría";
  for (const t of (await leerCalendario(repo)).turnos) {
    if (t.estado !== "corriendo" || (t.corriendoEn !== undefined && procesoVivo(t.corriendoEn))) continue;
    await actualizarTurno(repo, t.id, (actual) =>
      actual.estado === "corriendo" ? despuesDeCorrer(actual, false, ahora, PORQUE) : null,
    );
  }
}

/**
 * Un repo, un reloj. Cada consola arranca el reloj de TODOS los proyectos
 * de la lista (ver servidor.ts) y la app de escritorio abre una consola por
 * repo: con dos abiertas, dos procesos leían el mismo turno agendado, los
 * dos lo tomaban —la fila de escritura.ts es de un solo proceso— y el turno
 * corría dos veces. El reloj de un repo lo tiene un proceso a la vez,
 * anotado en `.dolphin/reloj.json` con su pid y un latido que se renueva en
 * cada vuelta, también mientras corre un turno. Si el dueño murió, o dejó
 * de latir —un pid que Windows le dio a otro programa no late—, lo toma otro.
 */
const RELOJ = "reloj.json";
/** Tres vueltas sin latir y el reloj se da por suelto. */
const VUELTAS_SIN_LATIR = 3;

type DuenoDelReloj = { readonly pid: number; readonly latido: number };

async function leerReloj(repo: string): Promise<DuenoDelReloj | undefined> {
  try {
    const datos = JSON.parse(await readFile(join(repo, ".dolphin", RELOJ), "utf8")) as Partial<DuenoDelReloj>;
    return typeof datos.pid === "number" && typeof datos.latido === "number" ? { pid: datos.pid, latido: datos.latido } : undefined;
  } catch {
    return undefined;
  }
}

/** Toma el reloj del repo, o le renueva el latido si ya es de este proceso. Devuelve si le toca mirar. */
export async function tomarReloj(repo: string, cadaMs: number, ahora = Date.now()): Promise<boolean> {
  const dueno = await leerReloj(repo);
  const deOtro = dueno !== undefined && dueno.pid !== process.pid;
  if (deOtro && procesoVivo(dueno.pid) && ahora - dueno.latido < cadaMs * VUELTAS_SIN_LATIR) return false;
  await carpetaDeDolphin(repo);
  await escribirDeUna(join(repo, ".dolphin", RELOJ), `${JSON.stringify({ pid: process.pid, latido: ahora })}\n`);
  if (!deOtro && dueno !== undefined) return true;
  // Tomarlo es escribir y volver a leer: si dos lo tomaron a la vez, gana el último que escribió.
  await new Promise((listo) => setTimeout(listo, 50));
  return (await leerReloj(repo))?.pid === process.pid;
}

/**
 * Al detenerse: si el reloj era de este proceso, queda suelto para otra
 * consola sin esperar tres vueltas. De una, sin promesas: es lo último que
 * hace un servidor que se cierra, y nadie lo espera.
 */
function soltarReloj(repo: string): void {
  const ruta = join(repo, ".dolphin", RELOJ);
  try {
    if ((JSON.parse(readFileSync(ruta, "utf8")) as Partial<DuenoDelReloj>).pid === process.pid) rmSync(ruta, { force: true });
  } catch {
    // Ya no está, o no se entiende: no hay nada que soltar.
  }
}

export interface Programador {
  /** Mira el calendario una vez y lanza lo que toque. Devuelve los que lanzó. */
  mirar(ahora?: Date): Promise<Turno[]>;
  /** Corta el turno que está corriendo, si es ese: lo usa «cancelar». Devuelve si había algo que cortar. */
  cortar(id: string): boolean;
  detener(): void;
}

/**
 * El reloj del calendario. Lanza de a un turno por vez —como el «idle
 * only» de OpenClaw: no se pisan—, y lo que lanza corre solo, con la
 * política encima. `lanzar` resuelve cuando el turno TERMINÓ, y recibe la
 * señal con la que «cancelar» lo corta.
 */
export function crearProgramador(
  repo: string,
  lanzar: (turno: Turno, senal: AbortSignal) => Promise<{ salio: boolean; porQue?: string; parte?: string }>,
  cadaMs = 30_000,
): Programador {
  let ocupado = false;
  let rescatado = false;
  let enCurso: { id: string; control: AbortController } | undefined;

  const mirar = async (ahora: Date = new Date()): Promise<Turno[]> => {
    if (ocupado) return [];
    ocupado = true;
    try {
      // El reloj de este repo lo tiene otra consola: mira ella.
      if (!(await tomarReloj(repo, cadaMs))) return [];
      if (!rescatado) {
        rescatado = true;
        await rescatarCortados(repo, ahora);
      }
      const llave = await llaveDeFirma();
      const toca = queToca(await leerCalendario(repo), ahora);
      // Lo que llegó escrito en el repo, sin la firma de esta máquina, se marca y no corre (ver firma.ts).
      for (const t of toca.filter((x) => !firmaValida(llave, firmable(x), x.firma))) {
        await actualizarTurno(repo, t.id, (actual) => (actual.estado === "agendado" ? { estado: "fallo", porQue: NO_FIRMADO } : null));
      }
      const elegido = toca.find((x) => firmaValida(llave, firmable(x), x.firma));
      if (!elegido) return [];

      // Se toma solo si sigue agendado EN DISCO: si lo cancelaron recién, no corre.
      const turno = await actualizarTurno(repo, elegido.id, (actual) =>
        actual.estado === "agendado" ? { estado: "corriendo", corriendoEn: process.pid } : null,
      );
      if (!turno) return [];

      const control = new AbortController();
      enCurso = { id: turno.id, control };
      let resultado: { salio: boolean; porQue?: string; parte?: string };
      try {
        resultado = await lanzar(turno, control.signal);
      } catch (error) {
        resultado = { salio: false, porQue: error instanceof Error ? error.message : String(error) };
      } finally {
        enCurso = undefined;
      }
      const fin = new Date();
      await actualizarTurno(repo, turno.id, (actual) => {
        const cambio = despuesDeCorrer(actual, resultado.salio, fin, resultado.porQue, resultado.parte);
        // Cancelado mientras corría: queda cancelado, con su vuelta anotada. Un diario no resucita.
        return actual.estado === "cancelado" ? { ...cambio, estado: "cancelado", cuando: actual.cuando } : cambio;
      });
      return [turno];
    } finally {
      ocupado = false;
    }
  };

  /** Un turno cancelado desde otra consola: el aviso llega por el disco, no por `cortar`. */
  const vigilarCancelado = async () => {
    const corriendo = enCurso;
    if (!corriendo) return;
    const turno = (await leerCalendario(repo)).turnos.find((t) => t.id === corriendo.id);
    if (turno?.estado === "cancelado") corriendo.control.abort();
  };

  const reloj = setInterval(() => {
    // Mientras corre un turno el latido sigue: si no, a las tres vueltas otra
    // consola tomaba el reloj y lanzaba el turno siguiente encima de este.
    if (ocupado) void tomarReloj(repo, cadaMs).catch(() => undefined);
    else void mirar().catch(() => undefined);
    void vigilarCancelado().catch(() => undefined);
  }, cadaMs);
  // El reloj no tiene que mantener vivo el proceso por sí solo.
  reloj.unref?.();

  return {
    mirar,
    cortar(id) {
      if (enCurso?.id !== id) return false;
      enCurso.control.abort();
      return true;
    },
    detener: () => {
      clearInterval(reloj);
      soltarReloj(repo);
    },
  };
}
