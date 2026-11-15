import type { EventoEnVivo } from "../nucleo/en-vivo.js";

/**
 * El estado del tablero de la terminal: se arma solo con los eventos del canal en vivo
 * (los mismos que lee la pantalla web), así sirve igual adentro de `sembrar` que mirando
 * desde afuera una siembra que lanzó la app o el autopiloto.
 */

export type EstadoDeFase = "espera" | "corre" | "paso" | "fallo" | "salteada" | "corrige";

export interface FaseDeUniverso {
  estado: EstadoDeFase;
  ms?: number;
  intento?: number;
  detalle?: string;
}

/** Por dónde va una rama: es lo que pinta su caja y su renglón en la línea de tiempo. */
export type Momento = "nace" | "escribe" | "porton" | "corrige" | "paso" | "cortada";

export interface UniversoEnTablero {
  id: string;
  enfoque: string;
  modelo?: string;
  momento: Momento;
  archivos?: number;
  agregadas?: number;
  quitadas?: number;
  porQue?: string;
  /** La fase que está corriendo ahora (o la última que corrió). */
  faseActual?: string;
  fases: Map<string, FaseDeUniverso>;
  /** Cada cambio de momento con su hora: de acá sale la línea de tiempo. */
  tramos: { t: number; momento: Momento }[];
}

export type Tono = "normal" | "bien" | "mal" | "aviso" | "suave";

export interface RenglonDeLog {
  t: number;
  u?: string;
  texto: string;
  tono: Tono;
}

export interface EstadoTablero {
  tarea: string;
  total: number;
  agente?: string;
  /** Las fases del portón en orden; si el evento de arranque no las trae, se suman al verlas. */
  fases: string[];
  universos: Map<string, UniversoEnTablero>;
  log: RenglonDeLog[];
  desde: number;
  ultimo: number;
  cosecha?: { elegida?: string; porQue?: string; ms?: number; gastado?: number; suscripcion?: boolean };
}

export type EventoConHora = EventoEnVivo & { t: number };

const LOG_MAXIMO = 200;

export function estadoInicial(desde: number): EstadoTablero {
  return { tarea: "", total: 0, fases: [], universos: new Map(), log: [], desde, ultimo: desde };
}

function anotar(estado: EstadoTablero, t: number, texto: string, tono: Tono, u?: string): void {
  estado.log.push({ t, texto, tono, ...(u ? { u } : {}) });
  if (estado.log.length > LOG_MAXIMO) estado.log.splice(0, estado.log.length - LOG_MAXIMO);
}

function mover(u: UniversoEnTablero, t: number, momento: Momento): void {
  if (u.momento === momento) return;
  u.momento = momento;
  u.tramos.push({ t, momento });
}

function universo(estado: EstadoTablero, id: string, t: number): UniversoEnTablero {
  let u = estado.universos.get(id);
  if (!u) {
    u = { id, enfoque: "", momento: "nace", fases: new Map(), tramos: [{ t, momento: "nace" }] };
    estado.universos.set(id, u);
  }
  return u;
}

const segundos = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** Aplica un evento al estado (lo modifica en el lugar: el tablero redibuja seguido). */
export function aplicarEvento(estado: EstadoTablero, evento: EventoConHora): EstadoTablero {
  const { t } = evento;
  estado.ultimo = Math.max(estado.ultimo, t);
  switch (evento.tipo) {
    case "siembra":
      estado.tarea = evento.tarea;
      estado.total = evento.universos;
      estado.desde = t;
      // Why: el tablero puede abrirse después (leyendo el archivo); la hora vale la de la siembra.
      estado.ultimo = t;
      if (evento.agente) estado.agente = evento.agente;
      if (evento.fases) estado.fases = [...evento.fases];
      anotar(estado, t, `siembra ${evento.universos === 1 ? "una rama" : `${evento.universos} ramas`}`, "suave");
      break;
    case "nace": {
      const u = universo(estado, evento.u, t);
      u.enfoque = evento.enfoque;
      mover(u, t, "escribe");
      anotar(estado, t, `nace · ${evento.enfoque}`, "suave", evento.u);
      break;
    }
    case "escribio": {
      const u = universo(estado, evento.u, t);
      u.archivos = evento.archivos;
      u.agregadas = evento.agregadas;
      u.quitadas = evento.quitadas;
      if (evento.modelo) u.modelo = evento.modelo;
      mover(u, t, "porton");
      anotar(estado, t, `escribió +${evento.agregadas} −${evento.quitadas} en ${evento.archivos === 1 ? "1 archivo" : `${evento.archivos} archivos`}${evento.modelo ? ` · ${evento.modelo}` : ""}`, "normal", evento.u);
      break;
    }
    case "fallo-escribiendo": {
      const u = universo(estado, evento.u, t);
      u.porQue = evento.porQue;
      mover(u, t, "cortada");
      anotar(estado, t, `se cayó escribiendo: ${evento.porQue}`, "mal", evento.u);
      break;
    }
    case "verifica": {
      const u = universo(estado, evento.u, t);
      if (!estado.fases.includes(evento.verificador)) estado.fases.push(evento.verificador);
      u.faseActual = evento.verificador;
      u.fases.set(evento.verificador, { ...u.fases.get(evento.verificador), estado: "corre" });
      mover(u, t, "porton");
      break;
    }
    case "veredicto": {
      const u = universo(estado, evento.u, t);
      if (!estado.fases.includes(evento.verificador)) estado.fases.push(evento.verificador);
      const estadoFase: EstadoDeFase = evento.salteada ? "salteada" : evento.paso ? "paso" : "fallo";
      u.fases.set(evento.verificador, {
        estado: estadoFase,
        ms: evento.ms,
        ...(evento.intento !== undefined ? { intento: evento.intento } : {}),
        ...(evento.detalle ? { detalle: evento.detalle } : {}),
      });
      // Pasó (quizás después de corregir): ya no está cortada por esta fase.
      if (evento.paso) delete u.porQue;
      if (evento.paso && u.momento === "cortada") mover(u, t, "porton");
      if (evento.salteada) anotar(estado, t, `${evento.verificador} salteada`, "aviso", evento.u);
      else if (evento.paso) anotar(estado, t, `${evento.verificador} pasó · ${segundos(evento.ms)}`, "bien", evento.u);
      else anotar(estado, t, `${evento.verificador} falló${evento.detalle ? `: ${evento.detalle}` : ""}`, "mal", evento.u);
      // Pasó la última fase del portón: la rama está lista para que la elijan.
      const ultima = estado.fases[estado.fases.length - 1];
      if (evento.paso && evento.verificador === ultima) mover(u, t, "paso");
      break;
    }
    case "corrige": {
      const u = universo(estado, evento.u, t);
      u.fases.set(evento.verificador, { estado: "corrige", intento: evento.intento });
      mover(u, t, "corrige");
      anotar(estado, t, `corrige ${evento.verificador} · vuelta ${evento.intento}`, "aviso", evento.u);
      break;
    }
    case "cosecha": {
      estado.cosecha = {
        ...(evento.elegida ? { elegida: evento.elegida } : {}),
        ...(evento.porQue ? { porQue: evento.porQue } : {}),
        ...(evento.ms !== undefined ? { ms: evento.ms } : {}),
        ...(evento.gastado !== undefined ? { gastado: evento.gastado } : {}),
        ...(evento.suscripcion ? { suscripcion: true } : {}),
      };
      // Lo que quedó sin veredicto final al cerrar: si no llegó al final, el portón lo cortó.
      for (const u of estado.universos.values()) {
        if (u.momento === "paso" || u.momento === "cortada") continue;
        const algunaFallo = [...u.fases.values()].some((f) => f.estado === "fallo");
        mover(u, t, algunaFallo ? "cortada" : "paso");
      }
      anotar(estado, t, evento.elegida ? `cosecha · elegida ${evento.elegida}` : "cosecha · no pasó nadie", evento.elegida ? "bien" : "mal");
      break;
    }
  }
  // Una rama que falló una fase y no la está corrigiendo quedó afuera.
  for (const u of estado.universos.values()) {
    if (u.momento !== "porton" && u.momento !== "corrige") continue;
    const fallada = [...u.fases.entries()].find(([, f]) => f.estado === "fallo");
    if (fallada && evento.tipo === "veredicto" && evento.u === u.id && !evento.paso && !evento.salteada) {
      u.porQue = `${fallada[0]}${fallada[1].detalle ? `: ${fallada[1].detalle}` : ""}`;
      mover(u, t, "cortada");
    }
  }
  return estado;
}

/** En qué etapa va la siembra entera: la tira de arriba del tablero resalta esta. */
export type Etapa = "sembrar" | "escribir" | "porton" | "elegir" | "entregar";

export const ETAPAS: readonly Etapa[] = ["sembrar", "escribir", "porton", "elegir", "entregar"];

export function etapaActual(estado: EstadoTablero): Etapa {
  if (estado.cosecha) return "entregar";
  const universos = [...estado.universos.values()];
  if (universos.length === 0) return "sembrar";
  if (universos.some((u) => u.momento === "escribe" || u.momento === "nace")) return "escribir";
  if (universos.some((u) => u.momento === "porton" || u.momento === "corrige")) return "porton";
  return "elegir";
}
