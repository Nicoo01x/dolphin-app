/**
 * Cuánto tardó un check y hace cuánto terminó, sacado de los dos tiempos que manda el host.
 *
 * Why acá y no en la fila: el panel de la derecha y el diálogo del PR dibujan la misma fila en
 * dos carpetas distintas, y esto es aritmética sobre dos fechas. La fila decide cómo se escribe
 * (eso sí lleva idioma); esto decide qué hay para escribir.
 */
export type CheckTimes = {
  startedAt?: string | null
  completedAt?: string | null
}

export type CheckTiming = {
  /** Lo que duró si terminó, o lo que lleva corriendo si no. `null` cuando no hay con qué. */
  duracionMs: number | null
  /** Hace cuánto terminó. `null` mientras corre, o si el host no dijo cuándo terminó. */
  desdeElFinalMs: number | null
}

/** Una fecha ISO en milisegundos, o `null` si el host mandó cualquier otra cosa. */
function enMilisegundos(valor: string | null | undefined): number | null {
  if (typeof valor !== 'string' || valor.length === 0) {
    return null
  }
  const ms = Date.parse(valor)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Why el piso en cero: los relojes del host y de esta máquina no son el mismo, así que un check
 * que acaba de terminar puede venir fechado unos segundos en el futuro. Mostrar «-3s» o «en 3
 * segundos» por eso sería contar una historia rara sobre un desfase de relojes.
 */
function noNegativo(ms: number): number {
  return Math.max(0, ms)
}

export function checkTiming(times: CheckTimes, ahoraMs: number): CheckTiming | null {
  const inicio = enMilisegundos(times.startedAt)
  const fin = enMilisegundos(times.completedAt)
  if (inicio === null && fin === null) {
    return null
  }
  if (fin === null) {
    // Corriendo: lo único que se sabe es hace cuánto arrancó, y eso ya es la duración.
    return { duracionMs: noNegativo(ahoraMs - (inicio as number)), desdeElFinalMs: null }
  }
  return {
    duracionMs: inicio === null ? null : noNegativo(fin - inicio),
    desdeElFinalMs: noNegativo(ahoraMs - fin)
  }
}
