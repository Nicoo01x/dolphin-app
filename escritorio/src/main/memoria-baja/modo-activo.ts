/**
 * Si el modo poca RAM está activo en este proceso, para lo que cambia de conducta con él.
 *
 * Va aparte del vigía y sin Electron a propósito: lo lee el runtime, que también corre en el
 * servidor sin ventana, donde nadie instala el vigía y la respuesta es siempre «no».
 */
import { nativeChatIdleStopMs } from '../../shared/native-chat/native-chat-idle-stop'

let leerActivo: () => boolean = () => false

export function instalarLecturaDelModoPocaRam(leer: () => boolean): void {
  leerActivo = leer
}

export function modoPocaRamActivo(): boolean {
  return leerActivo()
}

/**
 * Con poca RAM, un chat quieto se detiene a los 5 minutos en vez de esperar lo configurado.
 *
 * Es el mismo mecanismo de siempre (Ajustes → Chat → detener los chats quietos): el agente se cierra
 * y la conversación sigue ahí, se retoma con el próximo mensaje. Sólo se acorta la espera, nunca se
 * alarga, y si la persona eligió «nunca» se respeta: fue una decisión, no un default.
 */
export const ESPERA_DE_CHAT_CON_POCA_RAM_MS = 5 * 60_000

export function acortarEsperaConPocaRam(
  configurada: number | null,
  activo: boolean
): number | null {
  if (configurada === null || !activo) {
    return configurada
  }
  return Math.min(configurada, ESPERA_DE_CHAT_CON_POCA_RAM_MS)
}

/** La espera de un chat quieto que usa el barrido: la de Ajustes, acortada si falta memoria. */
export function esperaDeChatQuieto(
  settings: { readonly nativeChatIdleStopMinutes?: unknown } | null | undefined
): number | null {
  return acortarEsperaConPocaRam(nativeChatIdleStopMs(settings), modoPocaRamActivo())
}
