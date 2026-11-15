// Si hay un compactado pasando AHORA, para poder decirlo en vez de dejar el chat duro.
//
// Why no se lee de un evento del agente: `PreCompact` es el único que avisa el arranque y está
// deliberadamente sin registrar (`claude-managed-hook-events.ts`), porque se dispara antes de que
// el compactado se valide y uno abortado lo emite solo — de ahí salían paneles colgados en
// «trabajando». Lo que sí se sabe en el momento exacto, y sin preguntarle nada a nadie, es el
// `/compact` que la persona mandó: queda anotado acá con su hora (`native-chat-command-marker.ts`).
//
// Y por eso esto se apaga por TRES caminos, no por uno: cuando la marca del compactado entra en la
// conversación, cuando pasa el tope, y cuando el chat se desmonta. Un compactado que no termina
// nunca —abortado, o el agente cerrado en el medio— tiene que dejar de anunciarse solo.

import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { NativeChatCommandMarker } from './session/terminal/delivery/native-chat-command-marker'

/**
 * Cuánto se espera la marca del compactado antes de dejar de decir que está pasando.
 *
 * Why 90 s y no 10: compactar una conversación larga le lleva al modelo bastante más que un turno
 * corto, y un aviso que se apaga antes de que termine es peor que no tenerlo —la persona concluye
 * que se colgó justo cuando estaba por salir—. Y why un tope y no esperar para siempre: un
 * compactado abortado no deja marca, así que sin tope el aviso se queda girando hasta que alguien
 * cierre la pestaña.
 *
 * Y una nota sobre los relojes: la hora de un marcador local es de esta máquina y la de una fila de
 * la conversación es del host. En la práctica es la misma, y donde no lo sea el único efecto es un
 * reloj con unos segundos de corrimiento; el tope lo corta igual.
 */
export const TOPE_DE_COMPACTADO_MS = 90_000

/**
 * El primer término de lo que se mandó: `/compact algo` sigue siendo `/compact`, y la barra del
 * principio es opcional porque el diario del chat estructurado guarda el nombre sin ella.
 */
function esCompactado(command: string): boolean {
  const primero = command.trim().toLowerCase().split(/\s+/)[0] ?? ''
  return primero.replace(/^\//, '') === 'compact'
}

/** Si una fila de la conversación es la marca que deja un compactado terminado. */
function esLaMarcaDelCompactado(message: NativeChatMessage): boolean {
  return message.blocks.some(
    (block) => block.type === 'text' && block.presentation === 'compaction'
  )
}

/**
 * El `/compact` más nuevo que todavía no dejó su marca en la conversación, sin mirar el reloj.
 *
 * Why separado del tope: con esto la vista sabe si tiene que encender su reloj de un segundo, y
 * mientras no hay ningún compactado a la vista no enciende ninguno. El tope se aplica después, con
 * `compactadoVencido`.
 */
export function compactadoSinMarca(args: {
  /** Los comandos que el chat sobre el CLI anota de su lado; el estructurado no tiene ninguno. */
  readonly markers?: readonly NativeChatCommandMarker[]
  readonly messages: readonly NativeChatMessage[]
}): { readonly desde: number } | null {
  let desde: number | null = null
  const masNuevo = (cuando: number): void => {
    desde = desde === null || cuando > desde ? cuando : desde
  }
  for (const marker of args.markers ?? []) {
    if (esCompactado(marker.command)) {
      masNuevo(marker.sentAt)
    }
  }
  for (const message of args.messages) {
    // Why `queued` y `unsent` quedan afuera: un `/compact` esperando su turno en la cola, o uno que
    // volvió sin salir, no está compactando nada todavía. Anunciarlo deja el aviso puesto durante
    // todo el turno anterior, que es justo cuando la persona está mirando si el chat avanza.
    if (
      message.command !== undefined &&
      esCompactado(message.command.name) &&
      message.queued !== true &&
      message.unsent !== true &&
      message.timestamp !== null
    ) {
      masNuevo(message.timestamp)
    }
  }
  if (desde === null) {
    return null
  }
  const arranque = desde
  // Why `timestamp === null` cuenta como llegada: hay transcripciones que no traen hora (Grok), y
  // ahí no se puede ordenar nada. Entre anunciar un compactado que ya pasó y dejar el aviso
  // girando para siempre, lo primero dura un instante y lo segundo no se arregla solo.
  const llego = args.messages.some(
    (message) =>
      esLaMarcaDelCompactado(message) &&
      (message.timestamp === null || message.timestamp > arranque)
  )
  return llego ? null : { desde: arranque }
}

/** Si ya pasó el tope desde que arrancó, así que deja de anunciarse. */
export function compactadoVencido(desde: number, ahora: number): boolean {
  return ahora - desde >= TOPE_DE_COMPACTADO_MS
}

/**
 * El compactado que está pasando, si hay uno, con la hora en que arrancó —de ella sale el reloj
 * que se muestra—. `null` cuando no hay nada que anunciar.
 */
export function compactadoEnCurso(args: {
  readonly markers?: readonly NativeChatCommandMarker[]
  readonly messages: readonly NativeChatMessage[]
  readonly ahora: number
}): { readonly desde: number } | null {
  const candidato = compactadoSinMarca(args)
  return candidato && !compactadoVencido(candidato.desde, args.ahora) ? candidato : null
}
