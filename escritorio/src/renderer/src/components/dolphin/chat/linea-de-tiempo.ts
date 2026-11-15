import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { nombreDelModelo } from './uso-del-chat'

/**
 * Lo que fue pasando en la charla, en una fila por hito: qué le pediste, quién contestó, qué
 * archivo escribió, qué comando corrió y dónde se cayó.
 *
 * Es la línea de tiempo del chat rico: la conversación ya muestra los cuadros por turno, los
 * colores y el diff plegable de cada archivo, pero para saber «¿y esto en qué anda?» había que
 * leerla entera. Acá cada turno son tres o cuatro renglones.
 *
 * Determinista y barato: NO mira el texto de ningún diff ni la salida de ningún comando más allá de
 * su primera línea recortada, así que un diff de dos mil líneas pesa lo mismo que uno de dos. Y se
 * queda con los últimos `TOPE` hitos: una charla de mil mensajes no dibuja mil filas.
 */

/** Qué clase de hito es. Cada una tiene su color en la tarjeta. */
export type ClaseDeHito = 'pedido' | 'respuesta' | 'escritura' | 'comando' | 'error' | 'companeros'

export type Hito = {
  /** Clave estable: sale del mensaje, así que cargar mensajes más viejos no la mueve. */
  readonly clave: string
  readonly clase: ClaseDeHito
  /** Lo que se lee en la fila, de una línea. */
  readonly texto: string
  /** El id del modelo que habló, en un hito de respuesta: la fila le pone su logo. */
  readonly modelo?: string
  readonly cuando: number | null
}

export type LineaDeTiempo = {
  readonly hitos: readonly Hito[]
  /** Cuántos hitos quedaron afuera por arriba (los más viejos). */
  readonly antes: number
}

/** Más que esto no se lee de un vistazo, y es lo que hace que la tarjeta no crezca sin fin. */
export const TOPE = 60

/** Una fila es una línea: más que esto se corta. */
const LARGO = 80

const ESCRIBE = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

/** La primera línea con algo, recortada. Un mensaje de trescientas líneas entra igual. */
function unaLinea(texto: string): string {
  const linea = texto
    .split('\n')
    .map((parte) => parte.trim())
    .find((parte) => parte !== '')
  if (!linea) {
    return ''
  }
  return linea.length > LARGO ? `${linea.slice(0, LARGO - 1)}…` : linea
}

/** El nombre del archivo, sin la carpeta: la ruta entera no entra y el final es lo que importa. */
function nombreDeArchivo(ruta: string): string {
  const corte = Math.max(ruta.lastIndexOf('/'), ruta.lastIndexOf('\\'))
  return corte < 0 ? ruta : ruta.slice(corte + 1)
}

/** El campo que pide un objeto que pudo venir como texto JSON (así lo guarda el transcript). */
function campoDe(input: unknown, claves: readonly string[]): string | null {
  let valor = input
  if (typeof valor === 'string') {
    try {
      valor = JSON.parse(valor)
    } catch {
      return null
    }
  }
  if (!valor || typeof valor !== 'object') {
    return null
  }
  const objeto: Record<string, unknown> = valor as Record<string, unknown>
  for (const clave of claves) {
    const encontrado = objeto[clave]
    if (typeof encontrado === 'string' && encontrado.trim() !== '') {
      return encontrado
    }
  }
  return null
}

/** El texto propio del mensaje, sin lo que sea una herramienta. */
function textoDe(message: NativeChatMessage): string {
  return unaLinea(
    message.blocks
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
  )
}

type Estado = {
  /** El último modelo del que ya se anotó un hito: solo se vuelve a anotar si cambia. */
  ultimoModelo: string | null
  /** Hubo un pedido sin contestar: la próxima respuesta se anota aunque el modelo no cambie. */
  esperandoRespuesta: boolean
}

/** El hito del pedido de la persona; un mensaje en cola todavía no pasó. */
function hitoDePedido(message: NativeChatMessage): Hito | null {
  if (message.queued === true || message.unsent === true) {
    return null
  }
  const texto = textoDe(message)
  return texto === ''
    ? null
    : { clave: `${message.id}#pedido`, clase: 'pedido', texto, cuando: message.timestamp }
}

/** El hito de quién contestó: solo cuando cambia el modelo, o cuando hay un pedido esperando. */
function hitoDeRespuesta(message: NativeChatMessage, estado: Estado): Hito | null {
  const modelo = message.model
  if (!modelo || (modelo === estado.ultimoModelo && !estado.esperandoRespuesta)) {
    return null
  }
  return {
    clave: `${message.id}#respuesta`,
    clase: 'respuesta',
    texto: nombreDelModelo(modelo),
    modelo,
    cuando: message.timestamp
  }
}

/** Los hitos de las herramientas de un mensaje, en orden. */
function hitosDeHerramientas(message: NativeChatMessage): Hito[] {
  const hitos: Hito[] = []
  for (const [indice, block] of message.blocks.entries()) {
    const clave = `${message.id}#${indice}`
    if (block.type === 'tool-call' && ESCRIBE.has(block.name)) {
      const ruta = campoDe(block.input, ['file_path', 'notebook_path'])
      if (ruta) {
        hitos.push({
          clave: block.callId ?? clave,
          clase: 'escritura',
          texto: nombreDeArchivo(ruta),
          cuando: message.timestamp
        })
      }
    } else if (block.type === 'tool-call' && block.name === 'Bash') {
      const orden = campoDe(block.input, ['command'])
      if (orden) {
        hitos.push({
          clave: block.callId ?? clave,
          clase: 'comando',
          texto: unaLinea(orden),
          cuando: message.timestamp
        })
      }
    } else if (block.type === 'tool-result' && block.isError === true) {
      hitos.push({
        clave: `${clave}#error`,
        clase: 'error',
        texto: unaLinea(block.output) || 'Falló',
        cuando: message.timestamp
      })
    } else if (block.type === 'subagent-group' && block.agents.length > 0) {
      hitos.push({
        clave: `${clave}#companeros`,
        clase: 'companeros',
        texto: `${block.agents.length} compañeros`,
        cuando: message.timestamp
      })
    }
  }
  return hitos
}

/** Una escritura que falló no cambió nada: se aparea con su resultado por callId. */
function sinLasQueFallaron(hitos: readonly Hito[], fallidas: ReadonlySet<string>): Hito[] {
  return hitos.filter((hito) => hito.clase !== 'escritura' || !fallidas.has(hito.clave))
}

/** Los callId de los resultados que vinieron con error. */
function callIdsFallidos(messages: readonly NativeChatMessage[]): Set<string> {
  const fallidas = new Set<string>()
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type === 'tool-result' && block.isError === true && block.callId) {
        fallidas.add(block.callId)
      }
    }
  }
  return fallidas
}

/** Los hitos de la charla, en orden, con los últimos `tope`. */
export function lineaDeTiempo(
  messages: readonly NativeChatMessage[],
  tope: number = TOPE
): LineaDeTiempo {
  const estado: Estado = { ultimoModelo: null, esperandoRespuesta: false }
  const todos: Hito[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      const hito = hitoDePedido(message)
      if (hito) {
        todos.push(hito)
        estado.esperandoRespuesta = true
      }
      continue
    }
    if (message.role === 'assistant') {
      const hito = hitoDeRespuesta(message, estado)
      if (hito) {
        todos.push(hito)
        estado.esperandoRespuesta = false
      }
      if (message.model) {
        estado.ultimoModelo = message.model
      }
    }
    todos.push(...hitosDeHerramientas(message))
  }
  const hitos = sinLasQueFallaron(todos, callIdsFallidos(messages))
  return {
    hitos: hitos.slice(Math.max(0, hitos.length - tope)),
    antes: Math.max(0, hitos.length - tope)
  }
}
