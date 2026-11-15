import { join } from "node:path";
import { leerCalendario } from "./calendario.js";
import { leerConfig } from "./config.js";
import { carpetaDeDolphin, enFila, escribirDeUna, leerEstado } from "./escritura.js";
import type { Host } from "./ssh.js";

/**
 * La libreta de acá de los turnos que corren desprendidos en un VPS (ver turno-remoto.ts).
 *
 * Allá cada turno deja su estado; acá se anota adónde se lanzó y cuándo, y se tacha al terminar de
 * seguirlo. Sirve para dos cosas: `dolphin turno adjuntar <id>` sabe a qué máquina ir sin que se lo
 * digas, y `dolphin doctor` ve los que nadie tachó —Dolphin se cerró mientras corría, o el turno
 * quedó colgado allá— pasado el tope.
 */

export interface TurnoDesprendido {
  readonly id: string;
  readonly maquina: Host;
  /** Cuándo se lanzó, con el reloj de acá. */
  readonly lanzado: string;
  /** Cuándo se dejó de seguir, y cómo terminó. Sin esto, nadie lo está mirando. */
  readonly terminado?: string;
  readonly como?: string;
}

/** Los últimos, no un historial: lo viejo ya está en las cosechas y en el calendario. */
const GUARDADOS = 30;

const ruta = (repo: string) => join(repo, ".dolphin", "turnos-remotos.json");

export function leerDesprendidos(repo: string): Promise<TurnoDesprendido[]> {
  return leerEstado(ruta(repo), [] as TurnoDesprendido[], (datos) => {
    const lista = (datos as { turnos?: unknown } | null)?.turnos;
    return Array.isArray(lista) ? (lista as TurnoDesprendido[]).filter((t) => typeof t?.id === "string" && typeof t.maquina?.destino === "string") : [];
  });
}

async function cambiar(repo: string, cambio: (lista: TurnoDesprendido[]) => TurnoDesprendido[]): Promise<void> {
  await enFila(ruta(repo), async () => {
    await carpetaDeDolphin(repo);
    const nueva = cambio(await leerDesprendidos(repo)).slice(-GUARDADOS);
    await escribirDeUna(ruta(repo), `${JSON.stringify({ turnos: nueva }, null, 2)}\n`);
  });
}

export function anotarDesprendido(repo: string, id: string, maquina: Host, lanzado = new Date()): Promise<void> {
  return cambiar(repo, (lista) => [...lista.filter((t) => t.id !== id), { id, maquina, lanzado: lanzado.toISOString() }]);
}

export function tacharDesprendido(repo: string, id: string, como: string, cuando = new Date()): Promise<void> {
  return cambiar(repo, (lista) => lista.map((t) => (t.id === id ? { ...t, terminado: cuando.toISOString(), como } : t)));
}

/** Pasada una semana ya no se avisa: lo que haya pasado allá, pasó, y el aviso eterno se deja de leer. */
const AVISAR_HASTA = 7 * 24 * 60 * 60_000;

/** Los que nadie tachó y arrancaron hace más que el tope: o colgados allá, o huérfanos de seguimiento. */
export function desprendidosVencidos(lista: readonly TurnoDesprendido[], tope: number, ahora: Date): TurnoDesprendido[] {
  return lista.filter((t) => {
    const hace = ahora.getTime() - new Date(t.lanzado).getTime();
    return !t.terminado && hace > tope && hace < AVISAR_HASTA;
  });
}

/**
 * A qué máquina ir para ver un turno: la que se nombra (un host del dolphin.config.json), o la que
 * quedó anotada al lanzarlo, o la que firmó el calendario al agendarlo.
 */
export async function maquinaParaVer(repo: string, id: string, nombre?: string): Promise<{ ok: true; maquina: Host } | { ok: false; porQue: string }> {
  if (nombre) {
    const host = (await leerConfig(repo)).hosts?.[nombre];
    return host ? { ok: true, maquina: host } : { ok: false, porQue: `no hay un host «${nombre}» en dolphin.config.json` };
  }
  const anotado = (await leerDesprendidos(repo)).find((t) => t.id === id);
  if (anotado) return { ok: true, maquina: anotado.maquina };
  const delCalendario = (await leerCalendario(repo)).turnos.find((t) => t.id === id)?.maquina;
  if (delCalendario) return { ok: true, maquina: delCalendario };
  return { ok: false, porQue: `no tengo anotado adónde fue el turno «${id}»: pasale --host <nombre>` };
}
