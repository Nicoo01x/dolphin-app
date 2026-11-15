import { ubicarBloque } from './ubicar-bloque'

/**
 * Meter en el archivo abierto un bloque de código que propuso el chat.
 *
 * El chat y el editor viven en el mismo proceso, así que esto no pasa por el proceso principal: se
 * resuelve contra el modelo de Monaco que ya está en memoria.
 *
 * Lo importante es lo que NO hace. Si el bloque no se puede ubicar sin dudas, no escribe nada y lo
 * dice: la persona apretó un botón que dice «Aplicar», y aplicar en el lugar equivocado le deja el
 * archivo roto en otra parte, sin aviso. Y cuando escribe, lo hace como una edición más del
 * editor, para que Ctrl+Z la deshaga igual que si la hubiera tipeado.
 */

/** Lo mínimo que se necesita de un modelo de Monaco; así esto se prueba sin abrir un editor. */
export type ModeloDeTexto = {
  getValue: () => string
  getPositionAt: (offset: number) => { lineNumber: number; column: number }
  pushEditOperations: (
    selecciones: null,
    operaciones: {
      range: {
        startLineNumber: number
        startColumn: number
        endLineNumber: number
        endColumn: number
      }
      text: string
    }[],
    calcularSelecciones: () => null
  ) => void
}

export type ResultadoDeAplicar =
  | { estado: 'aplicado'; desde: number; hasta: number }
  /** Aparece en más de un lugar: hace falta que alguien elija. */
  | { estado: 'ambiguo' }
  /** No está en este archivo: puede ser otro archivo, o código nuevo. */
  | { estado: 'no-encontrado' }

export function aplicarBloqueEnModelo(modelo: ModeloDeTexto, bloque: string): ResultadoDeAplicar {
  const texto = modelo.getValue()
  const donde = ubicarBloque(texto, bloque)
  if (donde === 'ambiguo') {
    return { estado: 'ambiguo' }
  }
  if (!donde) {
    return { estado: 'no-encontrado' }
  }
  const inicio = modelo.getPositionAt(donde.desde)
  const fin = modelo.getPositionAt(donde.hasta)
  modelo.pushEditOperations(
    null,
    [
      {
        range: {
          startLineNumber: inicio.lineNumber,
          startColumn: inicio.column,
          endLineNumber: fin.lineNumber,
          endColumn: fin.column
        },
        text: bloque
      }
    ],
    () => null
  )
  return { estado: 'aplicado', desde: donde.desde, hasta: donde.hasta }
}
