import { codigoDeLaRespuesta } from './edicion-en-el-lugar-respuesta'

/**
 * El escalón `con-modelo` del Tab predictivo: lo que el camino local no puede deducir.
 *
 * El camino local (ver `components/editor/proxima-edicion.ts`) sólo sabe de renombres: cambiaste un
 * nombre y te ofrece los otros lugares que todavía dicen el viejo. Eso cubre el caso más común y no
 * gasta nada, pero no puede con lo que de verdad cuesta: cambiaste la forma de una función y hay que
 * reescribir cada llamada DISTINTO, o estás a mitad de una línea que se completa sola mirando las
 * dos de arriba.
 *
 * Acá vive lo que no depende del editor —armar el pedido y leer la respuesta—, en `shared` y sin
 * tocar Monaco, para poder probarlo sin navegador. Lo que decide CUÁNDO preguntar (y que no se
 * pregunte dos veces lo mismo) vive en `components/editor/prediccion-con-modelo-monaco.ts`.
 */

/** Cuánto contexto de cada lado viaja. Lo mismo que Cmd+K: dos pantallas alcanzan para entender. */
export const CONTEXTO_DE_PREDICCION = 2000

/**
 * El largo máximo de lo que se acepta como sugerencia.
 *
 * Una predicción de Tab completa una línea o unas pocas; si el modelo contesta cuarenta, no
 * entendió el pedido y aceptarlo de un tecla sería destructivo. Se descarta entero en vez de
 * recortarlo: media función pegada es peor que nada.
 */
export const MAXIMO_DE_LA_SUGERENCIA = 600

/** Cuántas líneas como mucho. Mismo criterio que el largo. */
export const MAXIMO_DE_LINEAS = 8

export type PedidoDePrediccion = {
  /** Todo lo que hay antes del cursor (recortado). */
  readonly antes: string
  /** Todo lo que hay después del cursor (recortado). */
  readonly despues: string
  readonly rutaDelArchivo: string
  /** Qué se acaba de escribir, si se sabe: es la pista más fuerte de la intención. */
  readonly ultimaEdicion?: string
}

export function promptDePrediccion(p: PedidoDePrediccion): string {
  return [
    'Estás completando código adentro de un editor. Tu respuesta se inserta TAL CUAL en la posición',
    'del cursor, sin que nadie la lea antes.',
    '',
    `Archivo: ${p.rutaDelArchivo}`,
    ...(p.ultimaEdicion ? ['', `Lo último que escribió la persona: ${p.ultimaEdicion}`] : []),
    '',
    'ANTES DEL CURSOR',
    p.antes,
    '',
    'DESPUÉS DEL CURSOR',
    p.despues,
    '',
    'Contestá SÓLO el texto que va en el cursor: sin explicación, sin cercas de código, sin repetir',
    'nada de lo que ya está antes o después. Si no hay una continuación evidente, contestá exactamente',
    'NADA.'
  ].join('\n')
}

/** Lo que el modelo contestó, ya listo para ofrecer como texto fantasma, o `undefined`. */
export function sugerenciaDeLaRespuesta(
  crudo: string,
  contexto: { readonly antes: string; readonly despues: string }
): string | undefined {
  const codigo = codigoDeLaRespuesta(crudo)
  // El modelo tiene permitido decir que no hay nada; es mejor eso que inventar una línea.
  if (!codigo || codigo.trim() === '' || /^nada\.?$/i.test(codigo.trim())) {
    return undefined
  }
  if (codigo.length > MAXIMO_DE_LA_SUGERENCIA || codigo.split('\n').length > MAXIMO_DE_LINEAS) {
    return undefined
  }
  // Un modelo que repite lo que ya estaba escrito es el error más común de este pedido, y pegarlo
  // duplica una línea entera sin que se note hasta que no compila.
  const sinRepetir = sinElComienzoRepetido(codigo, contexto.despues)
  if (sinRepetir.trim() === '') {
    return undefined
  }
  return sinRepetir
}

/**
 * Saca del final de la sugerencia lo que ya está escrito después del cursor.
 *
 * Pasa seguido: el cursor está en `const total = ` con `;` a la derecha y el modelo contesta
 * `precio + envio;`. Aceptar eso deja `precio + envio;;`.
 */
function sinElComienzoRepetido(codigo: string, despues: string): string {
  const cola = despues.slice(0, 40)
  for (let largo = Math.min(codigo.length, cola.length); largo > 0; largo--) {
    if (codigo.endsWith(cola.slice(0, largo))) {
      return codigo.slice(0, codigo.length - largo)
    }
  }
  return codigo
}

/**
 * Si vale la pena gastar en preguntar.
 *
 * Esto cuesta plata y una llamada tarda segundos: preguntar en cada pausa, en cualquier posición,
 * es la forma más rápida de quemar la cuota de alguien sin darle nada. Las tres guardias son las
 * que descartan los casos donde la respuesta no le sirve a nadie.
 */
export function valeLaPenaPreguntar(args: {
  /** Lo que hay antes del cursor en SU línea. */
  readonly lineaHastaElCursor: string
  /** Si el cursor está al final de la línea. */
  readonly alFinalDeLaLinea: boolean
  /** Cuánto se escribió desde la última vez que se preguntó. */
  readonly caracteresDesdeLaUltima: number
}): boolean {
  // En el medio de una línea, lo que falta ya está escrito a la derecha: completar ahí es estorbar.
  if (!args.alFinalDeLaLinea) {
    return false
  }
  // Una línea vacía o con dos letras no da ninguna pista: lo que vuelva va a ser inventado.
  if (args.lineaHastaElCursor.trim().length < 3) {
    return false
  }
  // Y sin nada nuevo escrito, la respuesta sería la misma que la de recién.
  return args.caracteresDesdeLaUltima > 0
}
