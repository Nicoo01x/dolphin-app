/**
 * El ida y vuelta de editar con IA en el lugar (Cmd+K), como máquina de estados.
 *
 * Está separado de la interfaz porque los errores de esta función no están en el dibujo: están en
 * el tiempo. El modelo tarda segundos y en el medio la persona sigue usando el editor. Si la
 * respuesta llega después de que cambió el documento y uno la aplica igual, la escribe en un tramo
 * que ya no es el que se eligió — borra otra cosa.
 *
 * Por eso cada paso lleva la revisión del documento y una respuesta vieja se descarta sola.
 */

import type { Tramo } from './edicion-en-el-lugar'

/** Quién contestó, para el encabezado del cuadrito: el agente que corrió y cómo se llama. */
export type AgenteQueResponde = { id?: string; nombre?: string }

/** Lo último que se habló, para que la pregunta siguiente no arranque de cero. */
export type IntercambioPrevio = { pedido: string; respuesta: string }

type Base = { tramo: Tramo; revision: number }

export type EstadoEdicion =
  | { fase: 'cerrado' }
  /** El cuadrito abierto, esperando que la persona escriba el pedido. */
  | (Base & { fase: 'escribiendo' })
  /** Pedido mandado, esperando al modelo. */
  | (Base & { fase: 'esperando'; instruccion: string; previa?: IntercambioPrevio })
  /** Llegó un reemplazo y está a la vista para aceptar o descartar. */
  | (Base & {
      fase: 'propuesta'
      instruccion: string
      codigo: string
      agente?: AgenteQueResponde
    })
  /**
   * El modelo contestó sin proponer ningún cambio: fue una pregunta, o no hacía falta tocar nada.
   *
   * Es una fase aparte y no una propuesta con prosa adentro porque lo único que no puede pasar es
   * que «Aceptar» escriba esa prosa en el archivo. Se decide por lo que trajo la respuesta —un
   * bloque de reemplazo o no—, nunca leyendo lo que dice el texto.
   */
  | (Base & { fase: 'respuesta'; instruccion: string; texto: string; agente?: AgenteQueResponde })
  /**
   * El pedido falló y el cuadrito se queda abierto diciendo por qué.
   *
   * Es una fase y no un cierre porque cerrarlo en silencio deja a la persona apretando Cmd+K otra
   * vez sin saber qué pasó: si el agente no está configurado, si el modelo contestó vacío o si no
   * hay plan. El pedido que escribió se conserva, así que corregir y reintentar no es volver a
   * escribirlo.
   */
  | (Base & { fase: 'fallo'; instruccion: string; motivo: string })

export type SucesoEdicion =
  | { tipo: 'abrir'; tramo: Tramo; revision: number }
  | { tipo: 'enviar'; instruccion: string }
  /** Llegó un reemplazo para el tramo. */
  | { tipo: 'llego'; codigo: string; revision: number; agente?: AgenteQueResponde }
  /** Llegó una respuesta sin cambio. */
  | { tipo: 'contesto'; texto: string; revision: number; agente?: AgenteQueResponde }
  | { tipo: 'fallo'; motivo: string; revision: number }
  /** El documento cambió: lo que haya en vuelo deja de valer. */
  | { tipo: 'documentoCambio'; revision: number }
  | { tipo: 'cancelar' }
  | { tipo: 'aceptar' }

export const EDICION_CERRADA: EstadoEdicion = { fase: 'cerrado' }

/** Lo que el envoltorio tiene que hacer además de cambiar de estado. */
export type EfectoEdicion =
  | {
      tipo: 'pedirAlModelo'
      tramo: Tramo
      instruccion: string
      revision: number
      previa?: IntercambioPrevio
    }
  | { tipo: 'aplicar'; tramo: Tramo; codigo: string }
  | { tipo: 'nada' }

export type Paso = { estado: EstadoEdicion; efecto: EfectoEdicion }

const sinEfecto = (estado: EstadoEdicion): Paso => ({ estado, efecto: { tipo: 'nada' } })

/**
 * Desde dónde se puede mandar un pedido, y con qué conversación detrás.
 *
 * Después de una respuesta o de una propuesta el campo sigue vivo: se puede seguir preguntando o
 * pedir otra vuelta sobre la misma selección, y lo que se habló viaja con el pedido nuevo.
 */
function previaPara(estado: EstadoEdicion): IntercambioPrevio | undefined | false {
  if (estado.fase === 'escribiendo' || estado.fase === 'fallo') {
    return undefined
  }
  if (estado.fase === 'respuesta') {
    return { pedido: estado.instruccion, respuesta: estado.texto }
  }
  if (estado.fase === 'propuesta') {
    return { pedido: estado.instruccion, respuesta: estado.codigo }
  }
  return false
}

function enviar(estado: EstadoEdicion, instruccion: string): Paso {
  const previa = previaPara(estado)
  if (previa === false || estado.fase === 'cerrado' || instruccion.trim() === '') {
    return sinEfecto(estado)
  }
  const { tramo, revision } = estado
  return {
    estado: { fase: 'esperando', tramo, revision, instruccion, previa },
    efecto: { tipo: 'pedirAlModelo', tramo, instruccion, revision, previa }
  }
}

/**
 * El siguiente estado y qué hay que hacer.
 *
 * Reglas que valen la pena nombrar, porque son las que se rompen solas:
 *
 * - Una respuesta de una revisión que ya no es la actual **se tira**. No se aplica «donde más o
 *   menos iba»: el tramo se midió en el documento de antes.
 * - Mientras se espera, cualquier cambio del documento cierra el pedido. Es preferible que la
 *   persona lo pida de nuevo a que le aparezca un reemplazo calculado sobre otro texto.
 * - Aceptar sólo hace algo si hay una propuesta a la vista. Un segundo Enter no vuelve a aplicar,
 *   y una respuesta sin cambio no tiene nada que aceptar.
 * - Un pedido vacío no se manda: el cuadrito se queda abierto.
 */
export function pasoDeEdicion(estado: EstadoEdicion, suceso: SucesoEdicion): Paso {
  switch (suceso.tipo) {
    case 'cancelar':
      return sinEfecto(EDICION_CERRADA)
    case 'abrir':
      return sinEfecto({ fase: 'escribiendo', tramo: suceso.tramo, revision: suceso.revision })
    case 'documentoCambio':
      // Mientras se escribe el pedido el documento no debería moverse, pero si se mueve —otra
      // pestaña, el agente escribiendo— el tramo deja de significar lo mismo.
      return estado.fase === 'cerrado' || estado.revision === suceso.revision
        ? sinEfecto(estado)
        : sinEfecto(EDICION_CERRADA)
    case 'enviar':
      return enviar(estado, suceso.instruccion)
    case 'aceptar':
      return estado.fase === 'propuesta'
        ? {
            estado: EDICION_CERRADA,
            efecto: { tipo: 'aplicar', tramo: estado.tramo, codigo: estado.codigo }
          }
        : sinEfecto(estado)
    default:
      return llegada(estado, suceso)
  }
}

/** Lo que vuelve del modelo: un reemplazo, una respuesta o una falla. */
function llegada(
  estado: EstadoEdicion,
  suceso: Extract<SucesoEdicion, { tipo: 'llego' | 'contesto' | 'fallo' }>
): Paso {
  // Llegó tarde: o se canceló, o el documento ya es otro. Se tira sin tocar nada —tampoco abre un
  // cartel de falla sobre un documento que ya cambió—.
  if (estado.fase !== 'esperando' || estado.revision !== suceso.revision) {
    return sinEfecto(estado)
  }
  const { tramo, revision, instruccion } = estado
  if (suceso.tipo === 'fallo') {
    return sinEfecto({ fase: 'fallo', tramo, revision, instruccion, motivo: suceso.motivo })
  }
  if (suceso.tipo === 'contesto') {
    return sinEfecto({
      fase: 'respuesta',
      tramo,
      revision,
      instruccion,
      texto: suceso.texto,
      agente: suceso.agente
    })
  }
  return sinEfecto({
    fase: 'propuesta',
    tramo,
    revision,
    instruccion,
    codigo: suceso.codigo,
    agente: suceso.agente
  })
}

/** Si hay algo en vuelo que convenga cortar al cerrar. */
export function hayPedidoEnVuelo(estado: EstadoEdicion): boolean {
  return estado.fase === 'esperando'
}
