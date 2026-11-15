import type {
  NativeChatBlock,
  NativeChatMessage,
  NativeChatToolCallBlock,
  NativeChatToolResultBlock
} from '../../../../../shared/native-chat/native-chat-types'
import { pairToolBlocks } from '../../../../../shared/native-chat/tools/native-chat-tool-pairs'
import { nativeChatToolCategory } from '../../../../../shared/native-chat/tools/native-chat-tool-icon'
import {
  normalizeToolInput,
  toolFilePath
} from '../../../../../shared/native-chat/tools/native-chat-tool-summary'
import { normalizedToolEditFiles } from '../../../../../shared/native-chat/tools/native-chat-edit-cards'
import type { NativeChatEditFile } from '../../../../../shared/native-chat/tools/native-chat-edit-model'
import { resultadoDeComando, type DetalleDeComando } from './resultado-de-comando'
import { comandoVisible } from './comando-visible'

/**
 * Los pasos de la tarjeta «Lo que hizo»: qué hizo un agente en un turno, una frase por paso.
 *
 * La frase la arma Dolphin a partir de la herramienta y su argumento, sin llamar a ningún modelo:
 * «Leyó src/pricing/plan.ts», «Corrió npm test: 1 falló», «Editó price-list.ts (+1 −1)». Si el dato
 * no alcanza (una lectura sin ruta, un comando sin texto, una edición que no se aplicó) el paso no
 * aparece: una tarjeta que se lee como un resumen de lo que pasó no puede contar cosas que no pasaron.
 *
 * Acá se decide QUÉ se dice (la acción, el objeto, el detalle); CÓMO se dice lo pone la tarjeta con
 * el catálogo de traducciones, así la frase sale en el idioma de la persona.
 */

export type TipoDePaso = 'leyo' | 'busco' | 'corrio' | 'edito'

/** El verbo de la frase: una edición puede crear, borrar o mover el archivo además de editarlo. */
export type AccionDePaso = TipoDePaso | 'creo' | 'borro' | 'movio'

export type DetalleDePaso =
  | DetalleDeComando
  | { readonly tipo: 'lineas'; readonly mas: number; readonly menos: number }

/** El color del resultado: rojo para lo que falló, verde para el arreglo que lo dejó andando. */
export type ResultadoDePaso = 'fallo' | 'arreglo'

export type PasoDeLoQueHizo = {
  readonly clave: string
  readonly tipo: TipoDePaso
  /** Segundos desde que arrancó el turno; null si el transcript no trae la hora del paso. */
  readonly segundo: number | null
  readonly accion: AccionDePaso
  /** Lo que se leyó, se corrió o se editó, tal cual: va en monoespaciada. */
  readonly objeto: string
  /** Lo que dijo el comando o el tamaño del cambio: «1 falló», «+1 −1». */
  readonly detalle: DetalleDePaso | null
  readonly resultado: ResultadoDePaso | null
  readonly diff: NativeChatEditFile | null
}

export type LoQueHizo = {
  readonly pasos: readonly PasoDeLoQueHizo[]
  /** Archivos distintos que el turno editó. */
  readonly archivos: number
  readonly segundos: number | null
}

type Llamada = {
  call: NativeChatToolCallBlock
  result: NativeChatToolResultBlock | undefined
  timestamp: number | null
}

/** Las llamadas del turno con su resultado y la hora del mensaje que las trajo. */
function llamadasDelTurno(mensajes: readonly NativeChatMessage[]): Llamada[] {
  const bloques: NativeChatBlock[] = []
  const hora = new Map<NativeChatBlock, number | null>()
  for (const mensaje of mensajes) {
    for (const bloque of mensaje.blocks) {
      bloques.push(bloque)
      hora.set(bloque, mensaje.timestamp)
    }
  }
  return pairToolBlocks(bloques).flatMap(({ call, result }) =>
    call ? [{ call, result, timestamp: hora.get(call) ?? null }] : []
  )
}

/** Las últimas tres partes de una ruta: alcanza para ubicarla y entra en una línea. */
export function rutaCorta(ruta: string): string {
  const partes = ruta.replaceAll('\\', '/').split('/').filter(Boolean)
  return partes.slice(-3).join('/')
}

/** La primera línea del comando, sin el `cd …&&` del principio, cortada a 60. */
export function comandoCorto(comando: string): string {
  const linea = (comando.split('\n')[0] ?? '').replace(/^cd\s+\S+\s*&&\s*/, '').trim()
  return linea.length > 60 ? `${linea.slice(0, 59)}…` : linea
}

function fallo(llamada: Llamada): boolean {
  return llamada.result?.isError === true || llamada.call.state === 'failed'
}

function pasoDeComando(
  llamada: Llamada,
  clave: string,
  segundo: number | null
): PasoDeLoQueHizo | null {
  const comando = comandoVisible(llamada.call.input)
  if (!comando) {
    return null
  }
  const resultado = resultadoDeComando(
    llamada.result?.output ?? '',
    llamada.call.exitCode,
    fallo(llamada)
  )
  return {
    clave,
    tipo: 'corrio',
    segundo,
    accion: 'corrio',
    objeto: comandoCorto(comando),
    detalle: resultado.detalle,
    resultado: resultado.fallo ? 'fallo' : null,
    diff: null
  }
}

function pasoDeLectura(
  llamada: Llamada,
  clave: string,
  segundo: number | null
): PasoDeLoQueHizo | null {
  const ruta = toolFilePath(llamada.call.input)
  if (!ruta || fallo(llamada)) {
    return null
  }
  return {
    clave,
    tipo: 'leyo',
    segundo,
    accion: 'leyo',
    objeto: rutaCorta(ruta),
    detalle: null,
    resultado: null,
    diff: null
  }
}

function pasoDeBusqueda(
  llamada: Llamada,
  clave: string,
  segundo: number | null
): PasoDeLoQueHizo | null {
  const entrada = normalizeToolInput(llamada.call.input)
  const patron =
    entrada && typeof entrada === 'object' && !Array.isArray(entrada)
      ? ((entrada as Record<string, unknown>).pattern ?? (entrada as Record<string, unknown>).query)
      : null
  if (typeof patron !== 'string' || !patron.trim()) {
    return null
  }
  return {
    clave,
    tipo: 'busco',
    segundo,
    accion: 'busco',
    objeto: comandoCorto(patron),
    detalle: null,
    resultado: null,
    diff: null
  }
}

const ACCION_DE_EDICION: Record<NativeChatEditFile['changeKind'], AccionDePaso> = {
  added: 'creo',
  deleted: 'borro',
  edited: 'edito',
  renamed: 'movio'
}

function pasosDeEdicion(
  llamada: Llamada,
  clave: string,
  segundo: number | null
): PasoDeLoQueHizo[] {
  // Una edición rechazada no cambió nada: contarla sería contar algo que no pasó.
  if (fallo(llamada)) {
    return []
  }
  const archivos = normalizedToolEditFiles(llamada.call, llamada.result) ?? []
  return archivos.map((archivo, indice) => ({
    clave: `${clave}:${indice}`,
    tipo: 'edito' as const,
    segundo,
    accion: ACCION_DE_EDICION[archivo.changeKind],
    objeto: rutaCorta(archivo.path),
    detalle:
      archivo.added + archivo.removed > 0
        ? { tipo: 'lineas' as const, mas: archivo.added, menos: archivo.removed }
        : null,
    resultado: null,
    diff: archivo.lines.length > 0 ? archivo : null
  }))
}

/**
 * «Arreglo listo»: el mismo comando que antes falló, corrido de nuevo después de una edición y ahora
 * sin fallar. Es lo único que la tarjeta afirma por su cuenta, y lo afirma porque está en el
 * transcript: falló, se editó, pasó.
 */
function marcarArreglos(pasos: PasoDeLoQueHizo[]): PasoDeLoQueHizo[] {
  const fallidos = new Map<string, number>()
  return pasos.map((paso, indice) => {
    if (paso.tipo !== 'corrio') {
      return paso
    }
    if (paso.resultado === 'fallo') {
      fallidos.set(paso.objeto, indice)
      return paso
    }
    const antes = fallidos.get(paso.objeto)
    const huboEdicion =
      antes !== undefined && pasos.slice(antes + 1, indice).some((otro) => otro.tipo === 'edito')
    if (!huboEdicion) {
      return paso
    }
    fallidos.delete(paso.objeto)
    return { ...paso, resultado: 'arreglo' }
  })
}

/** El inicio del turno: el mensaje de la persona, o el primero que tenga hora. */
function inicioDelTurno(
  mensajes: readonly NativeChatMessage[],
  inicio?: number | null
): number | null {
  if (typeof inicio === 'number') {
    return inicio
  }
  return mensajes.find((mensaje) => typeof mensaje.timestamp === 'number')?.timestamp ?? null
}

export function loQueHizo(
  mensajes: readonly NativeChatMessage[],
  opciones: { inicio?: number | null; segundosTrabajados?: number | null } = {}
): LoQueHizo {
  const inicio = inicioDelTurno(mensajes, opciones.inicio)
  const pasos: PasoDeLoQueHizo[] = []
  for (const [indice, llamada] of llamadasDelTurno(mensajes).entries()) {
    const segundo =
      inicio !== null && typeof llamada.timestamp === 'number'
        ? Math.max(0, Math.round((llamada.timestamp - inicio) / 1000))
        : null
    const clave = llamada.call.callId ?? `paso-${indice}`
    const categoria = nativeChatToolCategory(
      llamada.call.name,
      llamada.call.mcpIdentity,
      llamada.call.input
    )
    if (categoria === 'read') {
      const paso = pasoDeLectura(llamada, clave, segundo)
      if (paso) {
        pasos.push(paso)
      }
    } else if (categoria === 'search') {
      const paso = pasoDeBusqueda(llamada, clave, segundo)
      if (paso) {
        pasos.push(paso)
      }
    } else if (categoria === 'unknown') {
      const paso = pasoDeComando(llamada, clave, segundo)
      if (paso) {
        pasos.push(paso)
      }
    } else if (categoria === 'fileChange') {
      pasos.push(...pasosDeEdicion(llamada, clave, segundo))
    }
  }
  const archivos = new Set(pasos.filter((paso) => paso.tipo === 'edito').map((paso) => paso.objeto))
  const ultimo = mensajes.findLast((mensaje) => typeof mensaje.timestamp === 'number')?.timestamp
  const segundos =
    typeof opciones.segundosTrabajados === 'number'
      ? Math.round(opciones.segundosTrabajados)
      : inicio !== null && typeof ultimo === 'number'
        ? Math.max(0, Math.round((ultimo - inicio) / 1000))
        : null
  return { pasos: marcarArreglos(pasos), archivos: archivos.size, segundos }
}

/** «0:04», «1:12», «12:05»: la marca de tiempo de la pastilla. */
export function marcaDeTiempo(segundo: number): string {
  const minutos = Math.floor(segundo / 60)
  const resto = segundo % 60
  return `${minutos}:${String(resto).padStart(2, '0')}`
}
