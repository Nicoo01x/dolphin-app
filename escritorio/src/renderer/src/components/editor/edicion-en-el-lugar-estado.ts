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

export type EstadoEdicion =
  | { fase: 'cerrado' }
  /** El cuadrito abierto, esperando que la persona escriba el pedido. */
  | { fase: 'escribiendo'; tramo: Tramo; revision: number }
  /** Pedido mandado, esperando al modelo. */
  | { fase: 'esperando'; tramo: Tramo; revision: number; instruccion: string }
  /** Llegó el reemplazo y está a la vista para aceptar o descartar. */
  | { fase: 'propuesta'; tramo: Tramo; revision: number; instruccion: string; codigo: string }
  /**
   * El pedido falló y el cuadrito se queda abierto diciendo por qué.
   *
   * Es una fase y no un cierre porque cerrarlo en silencio deja a la persona apretando Cmd+K otra
   * vez sin saber qué pasó: si el agente no está configurado, si el modelo contestó vacío o si no
   * hay plan. El pedido que escribió se conserva, así que corregir y reintentar no es volver a
   * escribirlo.
   */
  | { fase: 'fallo'; tramo: Tramo; revision: number; instruccion: string; motivo: string }

export type SucesoEdicion =
  | { tipo: 'abrir'; tramo: Tramo; revision: number }
  | { tipo: 'enviar'; instruccion: string }
  | { tipo: 'llego'; codigo: string; revision: number }
  | { tipo: 'fallo'; motivo: string; revision: number }
  /** El documento cambió: lo que haya en vuelo deja de valer. */
  | { tipo: 'documentoCambio'; revision: number }
  | { tipo: 'cancelar' }
  | { tipo: 'aceptar' }

export const EDICION_CERRADA: EstadoEdicion = { fase: 'cerrado' }

/** Lo que el envoltorio tiene que hacer además de cambiar de estado. */
export type EfectoEdicion =
  | { tipo: 'pedirAlModelo'; tramo: Tramo; instruccion: string; revision: number }
  | { tipo: 'aplicar'; tramo: Tramo; codigo: string }
  | { tipo: 'nada' }

export type Paso = { estado: EstadoEdicion; efecto: EfectoEdicion }

const sinEfecto = (estado: EstadoEdicion): Paso => ({ estado, efecto: { tipo: 'nada' } })

/**
 * El siguiente estado y qué hay que hacer.
 *
 * Reglas que valen la pena nombrar, porque son las que se rompen solas:
 *
 * - Una respuesta de una revisión que ya no es la actual **se tira**. No se aplica «donde más o
 *   menos iba»: el tramo se midió en el documento de antes.
 * - Mientras se espera, cualquier cambio del documento cierra el pedido. Es preferible que la
 *   persona lo pida de nuevo a que le aparezca un reemplazo calculado sobre otro texto.
 * - Aceptar sólo hace algo si hay una propuesta a la vista. Un segundo Enter no vuelve a aplicar.
 * - Un pedido vacío no se manda: el cuadrito se queda abierto.
 */
export function pasoDeEdicion(estado: EstadoEdicion, suceso: SucesoEdicion): Paso {
  if (suceso.tipo === 'cancelar') {
    return sinEfecto(EDICION_CERRADA)
  }
  if (suceso.tipo === 'abrir') {
    return sinEfecto({ fase: 'escribiendo', tramo: suceso.tramo, revision: suceso.revision })
  }
  if (suceso.tipo === 'documentoCambio') {
    // Mientras se escribe el pedido el documento no debería moverse, pero si se mueve —otra
    // pestaña, el agente escribiendo— el tramo deja de significar lo mismo.
    return estado.fase === 'cerrado' || estado.revision === suceso.revision
      ? sinEfecto(estado)
      : sinEfecto(EDICION_CERRADA)
  }
  if (suceso.tipo === 'enviar') {
    if (estado.fase !== 'escribiendo' || suceso.instruccion.trim() === '') {
      return sinEfecto(estado)
    }
    return {
      estado: {
        fase: 'esperando',
        tramo: estado.tramo,
        revision: estado.revision,
        instruccion: suceso.instruccion
      },
      efecto: {
        tipo: 'pedirAlModelo',
        tramo: estado.tramo,
        instruccion: suceso.instruccion,
        revision: estado.revision
      }
    }
  }
  if (suceso.tipo === 'fallo') {
    // Una falla de una revisión que ya no corre llega tarde, igual que una respuesta buena: no
    // tiene por qué abrir un cartel sobre un documento que ya cambió.
    if (estado.fase !== 'esperando' || estado.revision !== suceso.revision) {
      return sinEfecto(estado)
    }
    return sinEfecto({
      fase: 'fallo',
      tramo: estado.tramo,
      revision: estado.revision,
      instruccion: estado.instruccion,
      motivo: suceso.motivo
    })
  }
  if (suceso.tipo === 'llego') {
    if (estado.fase !== 'esperando' || estado.revision !== suceso.revision) {
      // Llegó tarde: o se canceló, o el documento ya es otro. Se tira sin tocar nada.
      return sinEfecto(estado)
    }
    return sinEfecto({
      fase: 'propuesta',
      tramo: estado.tramo,
      revision: estado.revision,
      instruccion: estado.instruccion,
      codigo: suceso.codigo
    })
  }
  if (estado.fase !== 'propuesta') {
    return sinEfecto(estado)
  }
  return {
    estado: EDICION_CERRADA,
    efecto: { tipo: 'aplicar', tramo: estado.tramo, codigo: estado.codigo }
  }
}

/** Si hay algo en vuelo que convenga cortar al cerrar. */
export function hayPedidoEnVuelo(estado: EstadoEdicion): boolean {
  return estado.fase === 'esperando'
}
