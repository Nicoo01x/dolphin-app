import { basename } from "node:path";
import { armarActividad, type Actividad } from "../nucleo/actividad.js";
import { leerCosecha, listarCosechas, type CosechaGuardada } from "../nucleo/archivo.js";
import { leerBandeja, type Asunto } from "../nucleo/bandeja.js";
import { leerCalendario } from "../nucleo/calendario.js";
import { leerTablero, type Tarjeta } from "../nucleo/tarjetas.js";
import { leerCola, type TareaDeCola } from "../nucleo/cola.js";
import { gitValor } from "../nucleo/git.js";
import { leerMemoria, type Recuerdo } from "../nucleo/memoria.js";
import { leerProyectos, type Proyecto } from "../nucleo/proyectos.js";

/**
 * Lo que la app de terminal muestra, leído de los MISMOS archivos que la app de escritorio:
 * `.dolphin/` del proyecto (cosechas, memoria, bandeja, cola, calendario) y `~/.dolphin`
 * (los proyectos). No hay una copia propia: lo que cambia una se ve en la otra al refrescar.
 */

export interface CosechaEnLista {
  readonly id: string;
  readonly cosecha: CosechaGuardada;
}

export interface Instantanea {
  readonly repo: string;
  readonly nombre: string;
  readonly rama: string;
  readonly proyectos: readonly Proyecto[];
  readonly cosechas: readonly CosechaEnLista[];
  readonly recuerdos: readonly Recuerdo[];
  readonly asuntos: readonly Asunto[];
  readonly tarjetas: readonly Tarjeta[];
  readonly cola: readonly TareaDeCola[];
  readonly actividad: readonly Actividad[];
  readonly leida: number;
}

/** Cuántas cosechas se leen para el historial: las más nuevas. */
const COSECHAS = 40;

export async function leerInstantanea(repo: string, ahora = Date.now()): Promise<Instantanea> {
  const rutas = await listarCosechas(repo, COSECHAS).catch(() => [] as string[]);
  const [cosechas, memoria, bandeja, cola, calendario, tarjetas, proyectos, rama] = await Promise.all([
    Promise.all(rutas.map(async (r) => ({ id: basename(r), cosecha: await leerCosecha(r).catch(() => null) }))),
    leerMemoria(repo).catch(() => ({ recuerdos: [] as Recuerdo[] })),
    leerBandeja(repo).catch(() => ({ asuntos: [] as Asunto[] })),
    leerCola(repo).catch(() => ({ tareas: [] as TareaDeCola[] })),
    leerCalendario(repo).catch(() => ({ turnos: [] })),
    leerTablero(repo).catch(() => [] as Tarjeta[]),
    leerProyectos().catch(() => [] as Proyecto[]),
    gitValor(["rev-parse", "--abbrev-ref", "HEAD"], repo).catch(() => ""),
  ]);
  const validas = cosechas.filter((c): c is CosechaEnLista => c.cosecha !== null);
  const actividad = armarActividad({
    cosechas: validas,
    asuntos: bandeja.asuntos,
    turnos: calendario.turnos,
    recuerdos: memoria.recuerdos,
  });
  return {
    repo,
    nombre: proyectos.find((p) => p.ruta === repo)?.nombre ?? basename(repo),
    rama,
    proyectos,
    cosechas: validas,
    recuerdos: memoria.recuerdos,
    asuntos: bandeja.asuntos,
    tarjetas,
    cola: cola.tareas,
    actividad,
    leida: ahora,
  };
}

export function instantaneaVacia(repo: string): Instantanea {
  return { repo, nombre: basename(repo), rama: "", proyectos: [], cosechas: [], recuerdos: [], asuntos: [], tarjetas: [], cola: [], actividad: [], leida: 0 };
}

/** Hace cuánto, corto: «ahora», «5 min», «3 h», «2 d». */
export function haceCuanto(iso: string | undefined, ahora = Date.now()): string {
  if (!iso) return "";
  const ms = ahora - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}
