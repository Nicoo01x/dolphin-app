import type { ReactNode } from 'react'
import type { Translate } from '@/i18n/use-translate'

/**
 * La cola de los avisos que la app levanta sola: la interfaz de chat, las skills desactualizadas,
 * el tema de Claude Code, el texto del terminal.
 *
 * Hasta el 15/11/2026 cada uno salía por su lado —tres toasts de sonner y una tarjeta en la pila
 * de la esquina— y en una instalación nueva aparecían los cuatro a la vez, montados unos sobre
 * otros contra el borde derecho, tapando el explorador. Ahora salen de a uno, en el centro, y en
 * orden de importancia. Este archivo es sólo la regla: qué aviso toca y cuándo. No sabe dibujar.
 */

/**
 * Qué tanto pesa un aviso. El orden es lo que se muestra primero:
 * - `uso`: cambia cómo usás la app (la interfaz de chat).
 * - `accion`: te pide hacer algo (actualizar skills).
 * - `preferencia`: un gusto que se puede elegir después (tema de Claude Code, texto del terminal).
 */
export type Importancia = 'uso' | 'accion' | 'preferencia'

const RANGO: Record<Importancia, number> = { uso: 0, accion: 1, preferencia: 2 }

/** Entre un aviso y el siguiente: que se note que se fue uno antes de que llegue el otro. */
export const RESPIRO_ENTRE_AVISOS_MS = 700

/**
 * Una preferencia no entra pegada a otro aviso: espera dos minutos de calma desde que se cerró el
 * último. Así una instalación nueva no ve cuatro ventanas en el primer minuto.
 */
export const CALMA_ANTES_DE_UNA_PREFERENCIA_MS = 120_000

/**
 * Una sola preferencia por sesión. La que no entra no se pierde: su ajuste queda pendiente hasta
 * que se muestra, así que vuelve la próxima vez que abrís Dolphin.
 */
export const PREFERENCIAS_POR_SESION = 1

export type AccionesDelAviso = {
  /** Cierra la ventana como respondida; `despues` corre cuando terminó de irse. */
  readonly responder: (despues?: () => void) => void
  /** Cierra como «ahora no», igual que la ×, Escape, el velo o arrastrarla. */
  readonly descartar: () => void
}

export type Aviso = {
  /** Estable: volver a encolar el mismo id reemplaza el contenido, no suma una ventana. */
  readonly id: string
  readonly importancia: Importancia
  /**
   * Lo que lee un lector de pantalla al abrirse la ventana. Es una función, igual que el contenido,
   * porque se traduce al dibujar: un aviso se encola a veces antes de que cargue el catálogo, y
   * traducido en ese momento salía en inglés (pasó con el del texto del terminal).
   */
  readonly titulo: (t: Translate) => string
  readonly contenido: (acciones: AccionesDelAviso, t: Translate) => ReactNode
  /** Cuando entra a la vista. Lo que se marca «ya visto» va acá, no al encolar. */
  readonly alMostrar?: () => void
  /** Cerrar sin elegir. Es «ahora no»: nunca acepta nada. */
  readonly alDescartar?: () => void
}

export type AvisoEnCola = Aviso & { readonly llegada: number }

export type EstadoDeLaCola = {
  readonly avisos: readonly AvisoEnCola[]
  /** El que está en pantalla; mientras haya uno, no entra otro. */
  readonly visible: string | null
  readonly ultimoCierre: number | null
  readonly preferenciasMostradas: number
  readonly llegadas: number
}

export const COLA_VACIA: EstadoDeLaCola = {
  avisos: [],
  visible: null,
  ultimoCierre: null,
  preferenciasMostradas: 0,
  llegadas: 0
}

export function ordenarAvisos(avisos: readonly AvisoEnCola[]): AvisoEnCola[] {
  return [...avisos].sort(
    (a, b) => RANGO[a.importancia] - RANGO[b.importancia] || a.llegada - b.llegada
  )
}

export type Turno =
  | { readonly tipo: 'mostrar'; readonly aviso: AvisoEnCola }
  | { readonly tipo: 'esperar'; readonly ms: number }
  | { readonly tipo: 'nada' }

/** Qué hace la cola ahora: mostrar el que sigue, esperar un rato, o nada. */
export function turnoDeLaCola(estado: EstadoDeLaCola, ahora: number): Turno {
  if (estado.visible !== null) {
    return { tipo: 'nada' }
  }
  const [primero] = ordenarAvisos(estado.avisos)
  if (!primero) {
    return { tipo: 'nada' }
  }
  const esPreferencia = primero.importancia === 'preferencia'
  // Ordenados, si el primero es una preferencia es porque no queda nada más importante.
  if (esPreferencia && estado.preferenciasMostradas >= PREFERENCIAS_POR_SESION) {
    return { tipo: 'nada' }
  }
  const pausa = esPreferencia ? CALMA_ANTES_DE_UNA_PREFERENCIA_MS : RESPIRO_ENTRE_AVISOS_MS
  const falta = estado.ultimoCierre === null ? 0 : estado.ultimoCierre + pausa - ahora
  return falta > 0 ? { tipo: 'esperar', ms: falta } : { tipo: 'mostrar', aviso: primero }
}

export function encolar(estado: EstadoDeLaCola, aviso: Aviso): EstadoDeLaCola {
  const previo = estado.avisos.find((enCola) => enCola.id === aviso.id)
  if (previo) {
    return {
      ...estado,
      avisos: estado.avisos.map((enCola) =>
        enCola.id === aviso.id ? { ...aviso, llegada: previo.llegada } : enCola
      )
    }
  }
  return {
    ...estado,
    avisos: [...estado.avisos, { ...aviso, llegada: estado.llegadas }],
    llegadas: estado.llegadas + 1
  }
}

export function mostrar(estado: EstadoDeLaCola, id: string): EstadoDeLaCola {
  const aviso = estado.avisos.find((enCola) => enCola.id === id)
  if (!aviso || estado.visible !== null) {
    return estado
  }
  return {
    ...estado,
    visible: id,
    preferenciasMostradas:
      estado.preferenciasMostradas + (aviso.importancia === 'preferencia' ? 1 : 0)
  }
}

/** Sale de la cola, la cierre quien la cierre: la persona o el código que la levantó. */
export function quitar(estado: EstadoDeLaCola, id: string, ahora: number): EstadoDeLaCola {
  if (!estado.avisos.some((enCola) => enCola.id === id)) {
    return estado
  }
  const estabaALaVista = estado.visible === id
  return {
    ...estado,
    avisos: estado.avisos.filter((enCola) => enCola.id !== id),
    visible: estabaALaVista ? null : estado.visible,
    ultimoCierre: estabaALaVista ? ahora : estado.ultimoCierre
  }
}
