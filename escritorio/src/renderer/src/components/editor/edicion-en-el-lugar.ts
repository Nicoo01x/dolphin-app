/**
 * Editar con IA adentro del editor: seleccionás, decís qué querés, y se reescribe en el lugar.
 *
 * Este módulo es la parte del editor: armar el pedido y calcular el reemplazo. Leer la respuesta
 * del modelo vive en `shared/edicion-en-el-lugar-respuesta`, porque de eso también depende el
 * proceso principal, que es el que recibe la salida cruda del agente.
 */

import { ETIQUETA_DEL_REEMPLAZO } from '../../../../shared/edicion-en-el-lugar-respuesta'

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
 * Lo que cambia, en líneas enteras del archivo: cómo están hoy y cómo quedarían al aceptar.
 *
 * Es lo que muestra el diff de Cmd+K. Se agranda el tramo hasta el principio y el final de sus
 * líneas porque una selección casi nunca arranca en la columna 1 —arranca después de la sangría—, y
 * un diff de pedazos de línea muestra la primera sin sangría y las demás con, aunque en el archivo
 * vayan a quedar parejas. `primeraLinea` es la del archivo, desde 1.
 */
export function lineasDelCambio(
  texto: string,
  tramo: Tramo,
  codigo: string
): { antes: string; despues: string; primeraLinea: number } {
  const { texto: nuevo, tramoNuevo } = aplicarEdicionEnElLugar(texto, tramo, codigo)
  const inicio = texto.lastIndexOf('\n', tramo.desde - 1) + 1
  const corte = texto.indexOf('\n', tramo.hasta)
  const fin = corte === -1 ? texto.length : corte
  return {
    antes: texto.slice(inicio, fin),
    despues: nuevo.slice(inicio, tramoNuevo.hasta + (fin - tramo.hasta)),
    primeraLinea: texto.slice(0, inicio).split('\n').length
  }
}

/**
 * Lo que se le manda al modelo.
 *
 * Va el fragmento y además las líneas de alrededor, porque sin ellas el modelo no sabe qué nombres
 * tiene a mano y se inventa variables.
 *
 * Y va dicho cómo contestar cada clase de pedido, porque el editor decide por eso qué mostrar: un
 * cambio viene en un bloque ```reemplazo (que se puede aceptar sin leerlo como prosa) y una
 * pregunta viene en markdown, sin ese bloque (que se lee y nunca se escribe en el archivo).
 *
 * `previa` es lo último que se habló en el mismo cuadrito: con eso «¿y si es nulo?» después de una
 * respuesta se entiende.
 */
export function pedidoDeEdicion(args: {
  instruccion: string
  seleccion: string
  antes: string
  despues: string
  rutaDelArchivo: string
  previa?: { pedido: string; respuesta: string }
}): string {
  const conversacion = args.previa
    ? ['Lo que ya hablamos:', `Pedido: ${args.previa.pedido}`, args.previa.respuesta, '']
    : []
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
    ...conversacion,
    `Pedido: ${args.instruccion}`,
    '',
    'Si el pedido es un cambio, contestá SÓLO el fragmento reemplazado, adentro de un bloque ',
    `${CERCA}${ETIQUETA_DEL_REEMPLAZO}, sin explicación y sin repetir el contexto.`,
    'Si es una pregunta o no hace falta cambiar nada, contestá en markdown, corto, sin ningún ',
    `bloque ${ETIQUETA_DEL_REEMPLAZO}.`
  ].join('\n')
}

const CERCA = '```'
