/*
 * La cola de mensajes del chat sobre el CLI, como datos y transiciones puras.
 *
 * Why una cola de Dolphin: en el chat sobre el CLI un envío iba derecho al stdin, y el CLI lo
 * encolaba él. Desde la ventana no se podía adelantar ni sacar. Ahora, mientras el agente trabaja,
 * el mensaje espera acá y se escribe en el CLI cuando el turno termina, o cuando la persona toca
 * «enviar ahora». Mientras no salió, se puede borrar.
 */

export type MensajeEnCola = {
  id: string
  texto: string
  imagenes: readonly string[]
  encoladoEn: number
}

/** Por qué la cola no avanza sola: la persona frenó al agente, volvió de otra sesión, o no salió. */
export type MotivoDePausa = 'detenido' | 'restaurada' | 'noSalio'

export type EstadoDeCola = {
  mensajes: readonly MensajeEnCola[]
  pausa: MotivoDePausa | null
}

/** Lo que se acaba de entregar y todavía no vimos arrancar como turno. */
export type EsperaDelTurno = { desde: number; vioTrabajar: boolean } | null

export type MensajeQuitado = { mensaje: MensajeEnCola; indice: number }

export type AnclaDeMovimiento = { antesDe: string } | { despuesDe: string }

export const COLA_VACIA: EstadoDeCola = { mensajes: [], pausa: null }

/** Más que esto no es una cola, es un plan: el que sigue va derecho al CLI como siempre. */
export const TOPE_DE_LA_COLA = 20

/*
 * Why un tope de espera: si el turno que arrancó un mensaje fue tan corto que nunca lo vimos
 * trabajando, sin esto la cola quedaría esperando para siempre.
 */
export const ESPERA_MAXIMA_DEL_TURNO_MS = 15_000

export function retieneElEnvio(args: {
  estado: EstadoDeCola
  espera: EsperaDelTurno
  trabajando: boolean
}): boolean {
  const { estado, espera, trabajando } = args
  if (estado.mensajes.length >= TOPE_DE_LA_COLA) {
    return false
  }
  // Con mensajes esperando en una cola que avanza, uno nuevo va atrás para no saltearlos.
  const colaEnMarcha = estado.mensajes.length > 0 && estado.pausa === null
  return trabajando || espera !== null || colaEnMarcha
}

export function encolar(estado: EstadoDeCola, mensaje: MensajeEnCola): EstadoDeCola {
  return { ...estado, mensajes: [...estado.mensajes, mensaje] }
}

/** Saca un mensaje para mandarlo; null si ya no está (lo tomó el otro camino primero). */
export function tomar(
  estado: EstadoDeCola,
  id: string
): { estado: EstadoDeCola; tomado: MensajeQuitado | null } {
  const indice = estado.mensajes.findIndex((mensaje) => mensaje.id === id)
  if (indice === -1) {
    return { estado, tomado: null }
  }
  const mensajes = estado.mensajes.filter((_, posicion) => posicion !== indice)
  return {
    estado: { mensajes, pausa: mensajes.length === 0 ? null : estado.pausa },
    tomado: { mensaje: estado.mensajes[indice]!, indice }
  }
}

/** Vuelve a poner un mensaje donde estaba (deshacer un borrado, o un envío que no salió). */
export function restaurar(estado: EstadoDeCola, quitado: MensajeQuitado): EstadoDeCola {
  if (estado.mensajes.some((mensaje) => mensaje.id === quitado.mensaje.id)) {
    return estado
  }
  const indice = Math.min(Math.max(quitado.indice, 0), estado.mensajes.length)
  const mensajes = [...estado.mensajes]
  mensajes.splice(indice, 0, quitado.mensaje)
  return { ...estado, mensajes }
}

export function mover(estado: EstadoDeCola, id: string, ancla: AnclaDeMovimiento): EstadoDeCola {
  const movido = estado.mensajes.find((mensaje) => mensaje.id === id)
  const vecino = 'antesDe' in ancla ? ancla.antesDe : ancla.despuesDe
  if (!movido || vecino === id) {
    return estado
  }
  const resto = estado.mensajes.filter((mensaje) => mensaje.id !== id)
  const posicion = resto.findIndex((mensaje) => mensaje.id === vecino)
  if (posicion === -1) {
    return estado
  }
  resto.splice('antesDe' in ancla ? posicion : posicion + 1, 0, movido)
  return { ...estado, mensajes: resto }
}

export function pausar(estado: EstadoDeCola, motivo: MotivoDePausa): EstadoDeCola {
  return estado.mensajes.length === 0 ? estado : { ...estado, pausa: motivo }
}

export function reanudar(estado: EstadoDeCola): EstadoDeCola {
  return estado.pausa === null ? estado : { ...estado, pausa: null }
}

/**
 * Qué hacer ahora con la cola: el id del que sale, o null si todavía no toca.
 *
 * Sale de a uno: el que se escribe arranca un turno, y el siguiente espera a que ese termine. Por
 * eso, después de entregar, se espera a VER al agente trabajando y después quieto otra vez.
 */
export function decidirVaciado(args: {
  estado: EstadoDeCola
  espera: EsperaDelTurno
  trabajando: boolean
  puedeRecibir: boolean
  ahora: number
}): { espera: EsperaDelTurno; sale: string | null } {
  const { estado, trabajando, puedeRecibir, ahora } = args
  let espera = args.espera
  if (espera) {
    if (trabajando) {
      espera = espera.vioTrabajar ? espera : { ...espera, vioTrabajar: true }
    } else if (espera.vioTrabajar || ahora - espera.desde >= ESPERA_MAXIMA_DEL_TURNO_MS) {
      espera = null
    }
  }
  const primero = estado.mensajes[0]
  if (espera || estado.pausa !== null || trabajando || !puedeRecibir || !primero) {
    return { espera, sale: null }
  }
  return { espera, sale: primero.id }
}
