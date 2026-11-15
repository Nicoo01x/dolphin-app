/**
 * Las horas del calendario, en palabras. Lógica pura: se prueba sin navegador.
 */

export type Momento = "ahora" | "en-una-hora" | "esta-noche" | "manana" | "elegido";

/** El instante de un momento elegido, a partir de ahora. */
export function instanteDe(momento: Momento, ahora: Date, elegido?: string): Date | null {
  if (momento === "ahora") return null;
  if (momento === "en-una-hora") return new Date(ahora.getTime() + 60 * 60 * 1000);
  if (momento === "esta-noche") {
    const d = new Date(ahora);
    d.setHours(23, 0, 0, 0);
    // Si ya son más de las 23, «esta noche» es mañana a la noche.
    if (d.getTime() <= ahora.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  if (momento === "manana") {
    const d = new Date(ahora);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  if (!elegido) return null;
  const d = new Date(elegido);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dos = (n: number) => String(n).padStart(2, "0");

/** «hoy 23:00», «mañana 09:00», «vie 09:00», «12/11 09:00»: lo que dice el botón y la agenda. */
export function cuandoCorre(instante: Date, ahora: Date): string {
  const hora = `${dos(instante.getHours())}:${dos(instante.getMinutes())}`;
  const medianoche = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((medianoche(instante) - medianoche(ahora)) / 86_400_000);
  if (dias === 0) {
    const minutos = Math.round((instante.getTime() - ahora.getTime()) / 60_000);
    if (minutos > 0 && minutos < 60) return `en ${minutos} min`;
    return `hoy ${hora}`;
  }
  if (dias === 1) return `mañana ${hora}`;
  if (dias === -1) return `ayer ${hora}`;
  if (dias > 1 && dias < 7) return `${instante.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "")} ${hora}`;
  return `${dos(instante.getDate())}/${dos(instante.getMonth() + 1)} ${hora}`;
}

/** El valor de un <input type="datetime-local"> para un instante, en hora local. */
export function aInputLocal(d: Date): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
