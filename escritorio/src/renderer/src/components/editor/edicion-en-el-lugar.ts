/**
 * Editar con IA adentro del editor: seleccionás, decís qué querés, y se reescribe en el lugar.
 *
 * Este módulo es la parte del editor: armar el pedido y calcular el reemplazo. Leer la respuesta
 * del modelo vive en `shared/edicion-en-el-lugar-respuesta`, porque de eso también depende el
 * proceso principal, que es el que recibe la salida cruda del agente.
 */

export { codigoDeLaRespuesta } from '../../../../shared/edicion-en-el-lugar-respuesta'

/** Un tramo del documento, en caracteres. */
export type Tramo = { desde: number; hasta: number }

export type EdicionEnElLugar = {
  /** El documento ya con el cambio puesto. */
  texto: string
  /** Qué tramo ocupa ahora lo nuevo, para pintarle el diff encima. */
  tramoNuevo: Tramo
}

/** La sangría de la primera línea del tramo, que es la que hay que respetar. */
export function sangriaDelTramo(texto: string, tramo: Tramo): string {
  const arranqueDeLinea = texto.lastIndexOf('\n', tramo.desde - 1) + 1
  const hastaElTramo = texto.slice(arranqueDeLinea, tramo.desde)
  return /^[ \t]*$/.test(hastaElTramo) ? hastaElTramo : ''
}

/**
 * Reemplaza lo seleccionado por lo que contestó el modelo, respetando la sangría.
 *
 * Por qué la sangría: el modelo recibe el fragmento sin el contexto de columnas y casi siempre
 * contesta pegado al margen. Pegar eso adentro de una función deja la primera línea bien (porque
 * el cursor ya estaba sangrado) y todas las demás contra el borde. Acá se le vuelve a poner
 * adelante la sangría que tenía la selección, salvo a la primera línea, que ya la tiene por estar
 * donde está.
 *
 * Las líneas vacías quedan vacías: una línea de puros espacios es basura que después marca el lint.
 */
export function aplicarEdicionEnElLugar(
  texto: string,
  tramo: Tramo,
  codigo: string
): EdicionEnElLugar {
  const sangria = sangriaDelTramo(texto, tramo)
  const lineas = codigo.split('\n')
  const sangrado =
    sangria === ''
      ? codigo
      : lineas
          .map((linea, indice) => (indice === 0 || linea === '' ? linea : sangria + linea))
          .join('\n')
  return {
    texto: texto.slice(0, tramo.desde) + sangrado + texto.slice(tramo.hasta),
    tramoNuevo: { desde: tramo.desde, hasta: tramo.desde + sangrado.length }
  }
}

/**
 * Lo que se le manda al modelo.
 *
 * Va el fragmento y además las líneas de alrededor, porque sin ellas el modelo no sabe qué nombres
 * tiene a mano y se inventa variables. Y va dicho explícito que conteste sólo el reemplazo: es la
 * única forma de que el bloque se pueda pegar sin leerlo.
 */
export function pedidoDeEdicion(args: {
  instruccion: string
  seleccion: string
  antes: string
  despues: string
  rutaDelArchivo: string
}): string {
  return [
    `Archivo: ${args.rutaDelArchivo}`,
    '',
    'Contexto de arriba:',
    args.antes,
    '',
    'Fragmento a reemplazar:',
    args.seleccion,
    '',
    'Contexto de abajo:',
    args.despues,
    '',
    `Pedido: ${args.instruccion}`,
    '',
    'Contestá SÓLO el fragmento reemplazado, sin explicación y sin repetir el contexto.'
  ].join('\n')
}
