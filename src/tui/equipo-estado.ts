import { nombreDeCompanero, type EtapaDeEquipo, type EventoEquipo } from "../equipo/equipo.js";
import type { EstadoDeCompanero } from "../equipo/buzon.js";

/**
 * Lo que la pantalla del equipo necesita saber, armado evento por evento (como el tablero de la
 * siembra en tablero/estado.ts). Es puro: los eventos que manda `correrEquipo` entran por
 * `aplicarAlEquipo` y el dibujo solo lee.
 */

export const ETAPAS_DE_EQUIPO: readonly EtapaDeEquipo[] = ["plan", "spawn", "work", "merge", "review", "ship"];

export type EstadoDeTareaDeEquipo = "esperando" | "trabajando" | "lista" | "no-salio" | "en-conflicto" | "integrada" | "choco" | "deshecha";

export interface TareaDeEquipo {
  readonly id: string;
  readonly titulo: string;
  /** El compañero que la hace: un nombre corto por rol (ux, backend, tests…). */
  readonly dueno: string;
  readonly modelo?: string;
  readonly dependeDe?: string;
  estadoCompanero?: EstadoDeCompanero;
  estado: EstadoDeTareaDeEquipo;
  rama?: string;
  porQue?: string;
  /** El commit de su merge en la integración: con él se deshace. */
  commit?: string;
  empezo?: number;
  termino?: number;
  /** Líneas que escribió (sumadas si corrigió). */
  agregadas: number;
  quitadas: number;
  archivos: number;
  /** Fases del portón de su rama: nombre → pasó o no. */
  fases: { nombre: string; paso?: boolean }[];
}

export interface RenglonDeEquipo {
  readonly t: number;
  readonly quien: string;
  readonly texto: string;
  readonly tono: "normal" | "bien" | "mal" | "aviso";
}

export interface EstadoEquipo {
  objetivo: string;
  agente: string;
  lider?: string;
  revisor?: string;
  desde: number;
  etapa?: EtapaDeEquipo;
  resumen?: string;
  tareas: TareaDeEquipo[];
  /** El portón final y la revisión, sobre lo integrado. */
  finales: { verificador: string; estado: "corre" | "paso" | "fallo" | "salteada"; ms?: number; detalle?: string }[];
  log: RenglonDeEquipo[];
  fin?: { rama?: string; ruta?: string; porQue: string; ms: number; gastado: number; base?: string; ramaBase?: string };
}

export function equipoInicial(objetivo: string, agente: string, desde: number): EstadoEquipo {
  return { objetivo, agente, desde, tareas: [], finales: [], log: [] };
}

const TOPE_DE_LOG = 200;

export function aplicarAlEquipo(estado: EstadoEquipo, evento: EventoEquipo, t: number): EstadoEquipo {
  const decir = (quien: string, texto: string, tono: RenglonDeEquipo["tono"] = "normal"): void => {
    estado.log.push({ t, quien, texto, tono });
    if (estado.log.length > TOPE_DE_LOG) estado.log.splice(0, estado.log.length - TOPE_DE_LOG);
  };
  const tarea = (id: string) => estado.tareas.find((x) => x.id === id);

  switch (evento.tipo) {
    case "arranca":
      estado.objetivo = evento.objetivo;
      estado.agente = evento.agente;
      if (evento.lider) estado.lider = evento.lider;
      if (evento.revisor) estado.revisor = evento.revisor;
      decir("líder", `arranca: ${evento.objetivo}`);
      break;
    case "etapa":
      estado.etapa = evento.etapa;
      break;
    case "plan":
      estado.resumen = evento.resumen;
      // Dos compañeros con el mismo rol no pueden llamarse igual: el segundo «ux» es «ux2».
      const usados = new Map<string, number>();
      const unico = (nombre: string): string => {
        const veces = (usados.get(nombre) ?? 0) + 1;
        usados.set(nombre, veces);
        return veces === 1 ? nombre : `${nombre}${veces}`;
      };
      estado.tareas = evento.tareas.map((x, i) => ({
        id: x.id,
        titulo: x.titulo,
        dueno: unico(nombreDeCompanero(i, x.titulo)),
        ...(x.modelo ? { modelo: x.modelo } : {}),
        ...(x.dependeDe ? { dependeDe: x.dependeDe } : {}),
        estado: "esperando",
        agregadas: 0,
        quitadas: 0,
        archivos: 0,
        fases: [],
      }));
      decir("líder", evento.corregido ? `arranca con el plan que corregiste: ${evento.tareas.length} tarea(s)` : `partió la tarea en ${evento.tareas.length}: ${evento.resumen}`);
      break;
    case "plan-fallo":
      decir("líder", evento.porQue, "mal");
      break;
    case "tarea": {
      const x = tarea(evento.id);
      if (!x) break;
      x.estado = evento.estado;
      if (evento.rama) x.rama = evento.rama;
      if (evento.porQue) x.porQue = evento.porQue;
      if (evento.estado === "trabajando") {
        x.empezo = t;
        decir(x.dueno, `toma ${x.id}: ${x.titulo}`);
      } else if (evento.estado !== "esperando") {
        x.termino = t;
        const bien = evento.estado === "lista";
        decir(x.dueno, bien ? `terminó ${x.id}, pasó su portón` : `${x.id} no salió${evento.porQue ? `: ${evento.porQue}` : ""}`, bien ? "bien" : "mal");
      }
      break;
    }
    case "estado-companero": {
      const x = tarea(evento.id);
      if (x) x.estadoCompanero = evento.estado;
      break;
    }
    case "companero": {
      const x = tarea(evento.id);
      if (!x) break;
      const e = evento.evento;
      if (e.tipo === "escribio") {
        x.agregadas += e.agregadas;
        x.quitadas += e.quitadas;
        x.archivos = Math.max(x.archivos, e.archivos);
        decir(x.dueno, `escribió +${e.agregadas} −${e.quitadas} en ${e.archivos} archivo(s)`);
      } else if (e.tipo === "verifica") {
        if (!x.fases.some((f) => f.nombre === e.verificador)) x.fases.push({ nombre: e.verificador });
      } else if (e.tipo === "veredicto") {
        const fase = x.fases.find((f) => f.nombre === e.verificador) ?? (x.fases.push({ nombre: e.verificador }), x.fases.at(-1)!);
        fase.paso = e.paso || e.salteada === true;
        if (!e.paso && !e.salteada) decir(x.dueno, `${e.verificador} falló`, "aviso");
      } else if (e.tipo === "corrige") {
        decir(x.dueno, `corrige ${e.verificador} (intento ${e.intento})`, "aviso");
      } else if (e.tipo === "fallo-escribiendo") {
        decir(x.dueno, `se cayó escribiendo: ${e.porQue}`, "mal");
      }
      break;
    }
    case "choque": {
      const [a, b] = evento.ids.map((id) => tarea(id)?.dueno ?? id);
      const cuales = evento.archivos.length > 3 ? `${evento.archivos.slice(0, 3).join(", ")} y ${evento.archivos.length - 3} más` : evento.archivos.join(", ");
      decir("líder", `${a} y ${b} tocan lo mismo (${cuales}): puede chocar al integrar`, "aviso");
      break;
    }
    case "merge": {
      const x = tarea(evento.id);
      if (x) x.estado = evento.ok ? "integrada" : "choco";
      if (x && evento.commit) x.commit = evento.commit;
      const resuelto = evento.resuelto?.length ? `, resolviendo el choque en ${evento.resuelto.join(", ")}` : "";
      decir("líder", evento.ok ? `integró ${evento.id}${resuelto}` : `${evento.id} chocó al integrar${evento.porQue ? `: ${evento.porQue}` : ""}`, evento.ok ? "bien" : "mal");
      break;
    }
    case "fase-final": {
      const f = estado.finales.find((x) => x.verificador === evento.verificador);
      const nueva = { verificador: evento.verificador, estado: evento.estado, ...(evento.ms !== undefined ? { ms: evento.ms } : {}), ...(evento.detalle ? { detalle: evento.detalle } : {}) };
      if (f) Object.assign(f, nueva);
      else estado.finales.push(nueva);
      if (evento.estado !== "corre") {
        const quien = evento.verificador === "revisión" ? "revisor" : "portón";
        decir(quien, `${evento.verificador}: ${evento.estado === "paso" ? "pasó" : evento.estado === "salteada" ? "salteada" : "falló"}`, evento.estado === "fallo" ? "mal" : "bien");
      }
      break;
    }
    case "deshecha": {
      const x = tarea(evento.id);
      if (x && evento.ok) x.estado = "deshecha";
      decir("líder", evento.ok ? `deshizo ${evento.id}: ${evento.porQue}` : `${evento.id}: ${evento.porQue}`, evento.ok ? "bien" : "mal");
      break;
    }
    case "fin":
      estado.fin = {
        porQue: evento.porQue,
        ms: evento.ms,
        gastado: evento.gastado,
        ...(evento.rama ? { rama: evento.rama } : {}),
        ...(evento.ruta ? { ruta: evento.ruta } : {}),
        ...(evento.base ? { base: evento.base } : {}),
        ...(evento.ramaBase ? { ramaBase: evento.ramaBase } : {}),
      };
      decir("líder", evento.rama ? `listo: ${evento.rama}` : evento.porQue, evento.rama ? "bien" : "mal");
      break;
  }
  return estado;
}

/** Cuánto lleva cada tarea, de 0 a 1: esperar 0, escribir hasta la mitad, el portón el resto. */
export function progresoDe(x: TareaDeEquipo): number {
  if (x.estado === "lista" || x.estado === "integrada") return 1;
  if (x.estado === "deshecha") return 0;
  if (x.estado === "esperando") return 0;
  if (x.estado !== "trabajando") return 1;
  const escrita = x.agregadas + x.quitadas > 0 ? 0.5 : 0.15;
  const fases = x.fases.length > 0 ? x.fases.filter((f) => f.paso).length / x.fases.length : 0;
  return Math.min(0.97, escrita + fases * 0.45);
}
