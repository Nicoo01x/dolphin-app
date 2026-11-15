/**
 * «/programar diario 02:00 revisá las dependencias»: de lo que escribís a un turno del calendario
 * (el mismo que corren la consola y la app de escritorio, ver nucleo/calendario.ts). Se entiende la
 * hora (HH:MM o HH), «hoy», «mañana» y «diario»; si la hora de hoy ya pasó, es mañana.
 */

export interface Programacion {
  readonly cuando: Date;
  readonly diario: boolean;
  readonly tarea: string;
}

export function leerProgramacion(texto: string, ahora = new Date()): Programacion | undefined {
  const palabras = texto.trim().split(/\s+/);
  let diario = false;
  let manana = false;
  let hora: { h: number; m: number } | undefined;
  let i = 0;
  // Las primeras palabras dicen cuándo; lo que sigue es la tarea.
  for (; i < palabras.length && i < 4; i++) {
    const p = palabras[i]!.toLowerCase();
    if (p === "diario" || p === "todos-los-dias" || p === "cada-dia") diario = true;
    else if (p === "mañana" || p === "manana") manana = true;
    else if (p === "hoy" || p === "a" || p === "las") continue;
    else {
      const h = /^(\d{1,2})(?::(\d{2}))?(?:h|hs)?$/.exec(p);
      if (hora || !h || Number(h[1]) > 23 || Number(h[2] ?? 0) > 59) break;
      hora = { h: Number(h[1]), m: Number(h[2] ?? 0) };
    }
  }
  const tarea = palabras.slice(i).join(" ").trim();
  if (!hora || !tarea) return undefined;
  const cuando = new Date(ahora);
  cuando.setHours(hora.h, hora.m, 0, 0);
  if (manana || cuando.getTime() <= ahora.getTime()) cuando.setDate(cuando.getDate() + 1);
  return { cuando, diario, tarea };
}
