import {
  COLA_VACIA,
  decidirVaciado,
  encolar,
  pausar,
  restaurar,
  retieneElEnvio,
  tomar,
  type EsperaDelTurno,
  type EstadoDeCola,
  type MensajeEnCola,
  type MensajeQuitado,
  type MotivoDePausa
} from './cola-del-chat-modelo'

/*
 * Dónde vive la cola de cada chat. Una por panel y agente, en memoria y en localStorage.
 *
 * Why en localStorage: un mensaje en cola todavía no llegó a ningún lado. Si Dolphin se cierra con
 * mensajes esperando, perderlos sería perderlos en silencio. Al volver aparecen en la cola, en
 * pausa, para que la persona decida si mandarlos: un pedido de ayer no sale solo.
 */

export type EntregaDeLaCola = (mensaje: MensajeEnCola) => boolean

type Registro = {
  estado: EstadoDeCola
  espera: EsperaDelTurno
  oyentes: Set<() => void>
  entrega: EntregaDeLaCola | null
  /** Cuántas listas de esta cola hay a la vista: sin ninguna, el composer no retiene nada. */
  listas: number
}

const PREFIJO = 'dolphin.cola-del-chat:'
const registros = new Map<string, Registro>()

export function claveDeCola(paneKey: string, agent: string): string {
  return `${paneKey}\u0000${agent}`
}

function leerGuardado(clave: string): EstadoDeCola {
  try {
    const crudo = globalThis.localStorage?.getItem(PREFIJO + clave)
    if (!crudo) {
      return COLA_VACIA
    }
    const leido: unknown = JSON.parse(crudo)
    const mensajes = Array.isArray(leido) ? leido.filter(esMensajeEnCola) : []
    return pausar({ mensajes, pausa: null }, 'restaurada')
  } catch {
    return COLA_VACIA
  }
}

function esMensajeEnCola(valor: unknown): valor is MensajeEnCola {
  if (typeof valor !== 'object' || valor === null) {
    return false
  }
  const posible = valor as Record<string, unknown>
  return (
    typeof posible.id === 'string' &&
    typeof posible.texto === 'string' &&
    typeof posible.encoladoEn === 'number' &&
    Array.isArray(posible.imagenes) &&
    posible.imagenes.every((imagen) => typeof imagen === 'string')
  )
}

function guardar(clave: string, estado: EstadoDeCola): void {
  try {
    if (estado.mensajes.length === 0) {
      globalThis.localStorage?.removeItem(PREFIJO + clave)
    } else {
      globalThis.localStorage?.setItem(PREFIJO + clave, JSON.stringify(estado.mensajes))
    }
  } catch {
    // Sin almacenamiento la cola sigue andando; sólo no sobrevive a un cierre.
  }
}

function registro(clave: string): Registro {
  let actual = registros.get(clave)
  if (!actual) {
    actual = {
      estado: leerGuardado(clave),
      espera: null,
      oyentes: new Set(),
      entrega: null,
      listas: 0
    }
    registros.set(clave, actual)
  }
  return actual
}

function cambiar(clave: string, cambio: (estado: EstadoDeCola) => EstadoDeCola): void {
  const actual = registro(clave)
  const siguiente = cambio(actual.estado)
  if (siguiente === actual.estado) {
    return
  }
  actual.estado = siguiente
  guardar(clave, siguiente)
  for (const oyente of actual.oyentes) {
    oyente()
  }
}

export function leerCola(clave: string): EstadoDeCola {
  return registro(clave).estado
}

export function suscribirCola(clave: string, oyente: () => void): () => void {
  const { oyentes } = registro(clave)
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

export function cambiarCola(clave: string, cambio: (estado: EstadoDeCola) => EstadoDeCola): void {
  cambiar(clave, cambio)
}

export function montarListaDeCola(clave: string): () => void {
  const actual = registro(clave)
  actual.listas += 1
  return () => {
    actual.listas -= 1
  }
}

export function registrarEntrega(clave: string, entrega: EntregaDeLaCola): () => void {
  const actual = registro(clave)
  actual.entrega = entrega
  return () => {
    if (actual.entrega === entrega) {
      actual.entrega = null
    }
  }
}

/** Lo que llama el composer al enviar: true si el mensaje quedó en la cola y no va al CLI. */
export function retenerEnCola(
  clave: string,
  mensaje: Omit<MensajeEnCola, 'id' | 'encoladoEn'>,
  trabajando: boolean,
  ahora = Date.now()
): boolean {
  const actual = registro(clave)
  if (actual.listas === 0 || !retieneElEnvio({ ...actual, trabajando })) {
    return false
  }
  const id = `${ahora}-${Math.random().toString(36).slice(2, 10)}`
  cambiar(clave, (estado) => encolar(estado, { ...mensaje, id, encoladoEn: ahora }))
  return true
}

/** Saca el mensaje y lo escribe en el CLI. Si otro camino ya lo tomó, no hace nada. */
export function entregarDeLaCola(clave: string, id: string, ahora = Date.now()): boolean {
  const actual = registro(clave)
  const { estado, tomado } = tomar(actual.estado, id)
  if (!tomado) {
    return false
  }
  // Primero sale de la cola y recién después se escribe: así nunca se manda dos veces.
  cambiar(clave, () => estado)
  actual.espera = { desde: ahora, vioTrabajar: false }
  if (entregar(actual.entrega, tomado.mensaje)) {
    return true
  }
  actual.espera = null
  cambiar(clave, (siguiente) => pausar(restaurar(siguiente, tomado), 'noSalio'))
  return false
}

function entregar(entrega: EntregaDeLaCola | null, mensaje: MensajeEnCola): boolean {
  try {
    return entrega?.(mensaje) === true
  } catch {
    // Un error al escribir es un envío que no salió: vuelve a la cola, no se pierde.
    return false
  }
}

export function quitarDeLaCola(clave: string, id: string): MensajeQuitado | null {
  const { estado, tomado } = tomar(leerCola(clave), id)
  cambiar(clave, () => estado)
  return tomado
}

export function pausarCola(clave: string, motivo: MotivoDePausa): void {
  cambiar(clave, (estado) => pausar(estado, motivo))
}

/** Un paso del vaciado: avanza la espera y entrega el primero si toca. Devuelve si entregó. */
export function vaciarSiToca(
  clave: string,
  senales: { trabajando: boolean; puedeRecibir: boolean },
  ahora = Date.now()
): { entrego: boolean; esperando: boolean } {
  const actual = registro(clave)
  const { espera, sale } = decidirVaciado({
    ...senales,
    estado: actual.estado,
    espera: actual.espera,
    ahora
  })
  actual.espera = espera
  if (sale === null) {
    return { entrego: false, esperando: espera !== null }
  }
  return { entrego: entregarDeLaCola(clave, sale, ahora), esperando: true }
}

export function olvidarColasParaTests(): void {
  registros.clear()
}
