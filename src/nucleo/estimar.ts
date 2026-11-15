import type { Registro, TipoDeTarea } from "./desempeno.js";

/**
 * Cuánto va a costar un plan ANTES de gastar: es lo que más frena a soltar un equipo. Se estima con
 * lo que costó de verdad cada rama en ESTE repo (`.dolphin/desempeno.json`): la mediana del mismo
 * modelo en el mismo tipo de tarea; si no hay, la del tipo; si no hay nada, no se inventa un número:
 * se usa el tope que el líder le puso a la tarea y se dice que es eso, un tope.
 */

export interface TareaAEstimar {
  readonly id: string;
  readonly titulo: string;
  readonly tipo: TipoDeTarea;
  readonly modelo?: string;
  /** El tope de gasto que le puso el líder, en dólares. */
  readonly presupuesto: number;
}

export interface EstimacionDeTarea {
  readonly id: string;
  /** Lo esperable, en dólares. */
  readonly estimado: number;
  /** El tope: más que esto no gasta (el portón la corta). */
  readonly maximo: number;
  /** De dónde salió el número: «5 ramas de sonnet en funciones nuevas», o «sin historial: el tope». */
  readonly fuente: string;
}

export interface Estimacion {
  readonly tareas: readonly EstimacionDeTarea[];
  /** Lo esperable de todo el equipo, con lo que ya costó pensar el plan. */
  readonly estimado: number;
  readonly maximo: number;
  /** Cuántas tareas se estimaron con historial de verdad. */
  readonly conHistorial: number;
}

const mediana = (valores: readonly number[]): number => {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
};

const redondear = (dolares: number): number => Math.round(dolares * 100) / 100;

export function estimarPlan(tareas: readonly TareaAEstimar[], registros: readonly Registro[], costoDelPlan = 0): Estimacion {
  // Solo lo que se sabe cuánto costó: un costo desconocido es un piso, no una cifra.
  const conocidos = registros.filter((r) => !r.costoDesconocido && r.costo > 0);
  const estimadas = tareas.map((t): EstimacionDeTarea => {
    const delModelo = t.modelo ? conocidos.filter((r) => r.tipo === t.tipo && r.modelo === t.modelo) : [];
    const delTipo = conocidos.filter((r) => r.tipo === t.tipo);
    const muestra = delModelo.length > 0 ? delModelo : delTipo;
    if (muestra.length === 0) return { id: t.id, estimado: t.presupuesto, maximo: t.presupuesto, fuente: "sin historial: es el tope que le puso el líder" };
    const cuantas = `${muestra.length} rama${muestra.length === 1 ? "" : "s"}`;
    const fuente = delModelo.length > 0 ? `${cuantas} de ${t.modelo} en ${t.tipo}` : `${cuantas} de ${t.tipo}`;
    return { id: t.id, estimado: redondear(Math.min(t.presupuesto, mediana(muestra.map((r) => r.costo)))), maximo: t.presupuesto, fuente };
  });
  return {
    tareas: estimadas,
    estimado: redondear(estimadas.reduce((s, e) => s + e.estimado, 0) + costoDelPlan),
    maximo: redondear(estimadas.reduce((s, e) => s + e.maximo, 0) + costoDelPlan),
    conHistorial: estimadas.filter((e) => !e.fuente.startsWith("sin historial")).length,
  };
}

/** La estimación dicha para una persona. Con suscripción no se habla de plata: se habla de cupo. */
export function decirEstimacion(e: Estimacion, suscripcion: boolean): string {
  if (suscripcion) return `Con tu suscripción no se cobra aparte: usa cupo de ${e.tareas.length} agente${e.tareas.length === 1 ? "" : "s"} más el líder y el revisor.`;
  const base = `Estimado US$ ${e.estimado.toFixed(2)} (tope US$ ${e.maximo.toFixed(2)})`;
  if (e.conHistorial === 0) return `${base}. Todavía no hay historial en este repo: el estimado es el tope que puso el líder.`;
  return `${base}, con lo que costaron de verdad las ramas de este repo (${e.conHistorial} de ${e.tareas.length} tareas con historial).`;
}

/** ¿Se pasa del tope del proyecto (dolphin.config.json → terminal.tope)? Se mira el máximo: el peor caso. */
export const pasaDelTope = (e: Estimacion, tope: number | undefined): boolean => tope !== undefined && tope > 0 && e.maximo > tope;
