import type { Turno } from "./tipos";

/**
 * La barra lateral, por secciones: como en cualquier app de LLMs, lo de
 * hoy arriba y lo de ayer abajo. Y una tarea es UNA entrada aunque se haya
 * sembrado cinco veces: sus corridas van adentro, como las ramas de un
 * repo en DOLPHIN. Es lógica pura: se testea sin navegador.
 */

export const SECCIONES = ["Hoy", "Ayer", "Últimos 7 días", "Últimos 30 días", "Antes"] as const;
export type TituloDeSeccion = (typeof SECCIONES)[number];

export interface Entrada {
  /** La tarea tal como se pidió en su corrida más nueva. */
  readonly tarea: string;
  /** Sus corridas, de la más nueva a la más vieja. La primera es la que se
   *  abre al tocar la entrada. */
  readonly corridas: readonly Turno[];
}

export interface Seccion {
  readonly titulo: TituloDeSeccion;
  readonly entradas: readonly Entrada[];
}

const DIA = 86_400_000;

/** Días de calendario entre dos fechas, en hora local (inmune al cambio de horario). */
function diasEntre(antes: Date, despues: Date): number {
  const medianoche = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((medianoche(despues) - medianoche(antes)) / DIA);
}

function fechaDe(cuando: string | undefined): Date | null {
  if (!cuando) return null;
  const fecha = new Date(cuando);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function seccionDe(cuando: string | undefined, ahora: Date): TituloDeSeccion {
  const fecha = fechaDe(cuando);
  if (!fecha) return "Antes";
  const dias = diasEntre(fecha, ahora);
  // Un reloj adelantado deja fechas «del futuro»: van con lo de hoy.
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 7) return "Últimos 7 días";
  if (dias < 30) return "Últimos 30 días";
  return "Antes";
}

/** La misma tarea escrita con otro espacio o mayúscula sigue siendo la misma. */
const claveDeTarea = (tarea: string) => tarea.trim().replace(/\s+/g, " ").toLowerCase();

const tiempoDe = (cuando: string | undefined) => fechaDe(cuando)?.getTime() ?? 0;

export function seccionesDe(turnos: readonly Turno[], ahora: Date = new Date()): Seccion[] {
  // Lo más nuevo primero, sin confiar en el orden en que llegaron.
  const ordenados = [...turnos].sort((a, b) => tiempoDe(b.cuando) - tiempoDe(a.cuando));

  // Cada tarea, una sola vez, con todas sus corridas. El Map conserva el
  // orden de la primera aparición: la tarea con la corrida más nueva va
  // primero, y cae en la sección de esa corrida —como una conversación,
  // que se ordena por su último mensaje—.
  const porTarea = new Map<string, Turno[]>();
  for (const turno of ordenados) {
    const clave = claveDeTarea(turno.tarea);
    const corridas = porTarea.get(clave);
    if (corridas) corridas.push(turno);
    else porTarea.set(clave, [turno]);
  }

  const porSeccion = new Map<TituloDeSeccion, Entrada[]>();
  for (const corridas of porTarea.values()) {
    const nueva = corridas[0]!;
    const titulo = seccionDe(nueva.cuando, ahora);
    const entradas = porSeccion.get(titulo) ?? [];
    entradas.push({ tarea: nueva.tarea, corridas });
    porSeccion.set(titulo, entradas);
  }

  return SECCIONES.filter((t) => porSeccion.has(t)).map((titulo) => ({
    titulo,
    entradas: porSeccion.get(titulo)!,
  }));
}

const dos = (n: number) => String(n).padStart(2, "0");

/**
 * La hora que acompaña a una corrida: la sección ya dice el día. Se arma
 * a mano porque el ICU de es-AR ignora el 2-digit del día («9/10»).
 */
export function horaCorta(cuando: string | undefined, seccion: TituloDeSeccion): string {
  const fecha = fechaDe(cuando);
  if (!fecha) return "";
  if (seccion === "Hoy" || seccion === "Ayer") return `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`;
  if (seccion === "Últimos 7 días") {
    return fecha.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
  }
  return `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}`;
}

/**
 * Cuándo corrió, sin una sección al lado que diga el día: es lo que
 * llevan las corridas anidadas, que pueden ser de días distintos.
 */
export function momentoDe(cuando: string | undefined, ahora: Date = new Date()): string {
  const hora = horaCorta(cuando, "Hoy");
  if (hora === "") return "";
  const seccion = seccionDe(cuando, ahora);
  if (seccion === "Hoy") return hora;
  if (seccion === "Ayer") return `ayer ${hora}`;
  return `${horaCorta(cuando, seccion)} ${hora}`;
}

/** Cómo le fue a una corrida, en una palabra de estado. */
export function resultadoDe(turno: Turno): "paso" | "corto" {
  return turno.vivos > 0 ? "paso" : "corto";
}

/** El resultado en palabras: con una sola rama no hace falta contar. */
export function resumenDe(turno: Turno): string {
  // «0 de 0 pasaron» no dice nada: lo que pasó es que no hubo ramas.
  if (turno.universos === 0) return "sin ramas";
  if (turno.universos === 1) {
    if (turno.vivos === 0) return "se cortó";
    // Sin fases no se probó nada: decirlo, no maquillarlo de «probada».
    return turno.intentos?.[0]?.fases === 0 ? "sin probar" : "probada";
  }
  return `${turno.vivos} de ${turno.universos} pasaron`;
}
