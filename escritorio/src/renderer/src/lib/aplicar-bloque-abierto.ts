/**
 * A qué archivo va un bloque de código que propuso el chat.
 *
 * El chat y el editor viven en el mismo proceso pero no se conocen, así que el editor deja acá
 * cómo aplicar un bloque y el chat lo usa sin saber nada de Monaco. Es el mismo patrón que
 * `file-search-selection`, con una diferencia que importa: acá NO gana el último que se registró,
 * gana el de **foco más reciente**. Con dos archivos abiertos, el botón tiene que escribir en el
 * que la persona estaba mirando, no en el que se montó último — que con las pestañas restauradas
 * al arrancar puede ser cualquiera.
 */

/** Lo que el editor contesta: dónde quedó el bloque, o por qué no se pudo. */
export type ComoSalioElApply = 'aplicado' | 'ambiguo' | 'no-encontrado'

export type DestinoDeApply = {
  /** Para poder decir en qué archivo se escribió. */
  rutaDelArchivo: string
  /** Milisegundos de `performance.now()` de la última vez que esta vista tuvo el foco. */
  ultimoFoco: () => number
  aplicar: (bloque: string) => ComoSalioElApply
}

export type ResultadoDeApply =
  | { estado: ComoSalioElApply; archivo: string }
  /** No hay ningún editor abierto donde escribir. */
  | { estado: 'sin-editor' }

const destinos = new Set<DestinoDeApply>()

export function registrarDestinoDeApply(destino: DestinoDeApply): () => void {
  destinos.add(destino)
  return () => {
    destinos.delete(destino)
  }
}

/** El editor que la persona tocó más recientemente, o null si no hay ninguno. */
export function destinoDeApply(): DestinoDeApply | null {
  let elegido: DestinoDeApply | null = null
  for (const destino of destinos) {
    if (!elegido || destino.ultimoFoco() > elegido.ultimoFoco()) {
      elegido = destino
    }
  }
  return elegido
}

export function hayDondeAplicar(): boolean {
  return destinos.size > 0
}

/**
 * Mete el bloque en el archivo abierto.
 *
 * No decide nada por su cuenta: el editor es el que ubica el tramo y se niega cuando no puede
 * hacerlo sin dudar. Acá sólo se elige a quién preguntarle.
 */
export function aplicarBloqueEnElEditorAbierto(bloque: string): ResultadoDeApply {
  const destino = destinoDeApply()
  if (!destino) {
    return { estado: 'sin-editor' }
  }
  return { estado: destino.aplicar(bloque), archivo: destino.rutaDelArchivo }
}

/** Para las pruebas: deja el registro vacío. */
export function olvidarDestinosDeApply(): void {
  destinos.clear()
}
