import { anunciaUnPlan } from './sugerencia-de-respuesta'

/**
 * Cuando el líder termina de pensar y lo que dejó es un plan, de ahí sale a quién delegarle cada
 * parte: una tarea por renglón de su lista, para abrir cada una como un trabajo del proyecto.
 *
 * Sale de REGLAS sobre el texto, no de un modelo, por lo mismo que la sugerencia de respuesta: la
 * propuesta tiene que estar ahí en el momento en que terminás de leer el plan, y pagarle a un
 * modelo para partir una lista que ya viene partida es gastar dos veces.
 *
 * El tope de 8 es el del plan del núcleo (src/nucleo/plan.ts, LIMITES.tareas): más compañeros a la
 * vez no es más rápido, es más choques sobre los mismos archivos.
 */

export type TareaParaDelegar = {
  /** Corto y único dentro de la propuesta: «t1», «t2»… como las tareas del plan del núcleo. */
  readonly id: string
  /** Lo que se lee en la fila de la ventana. */
  readonly titulo: string
  /** El pedido entero, como se lo daría una persona a un agente. */
  readonly pedido: string
}

export type PropuestaDeDelegacion = {
  readonly tareas: readonly TareaParaDelegar[]
}

const TOPE_DE_TAREAS = 8
/** Con una sola no hay a quién delegarle: la hace el mismo que la pensó. */
const MINIMO_DE_TAREAS = 2
const TITULO = 72
/** Un renglón más corto que esto es un «ok» o un «listo», no una tarea. */
const PEDIDO_MINIMO = 8

// Hasta tres espacios de sangría: más adentro es un subpunto de otra tarea, no una tarea.
const NUMERADA = /^ {0,3}\d{1,2}[.)]\s+(\S.*)$/
const VINETA = /^ {0,3}[-*•]\s+(\S.*)$/
/** La casilla de un to-do (`- [ ] algo`) queda del lado de la viñeta, no del pedido. */
const CASILLA = /^\[[ xX]\]\s+/
const CERCO_DE_CODIGO = /^ {0,3}```/
/** Negritas, itálicas de dos guiones bajos y comillas de código: marcado que no se lee en voz alta. */
const MARCADO = /\*\*|__|`/g
/** Donde la tarea deja de decir qué es y empieza a decir cómo: guion, dos puntos o punto. */
const CORTE_DEL_TITULO = /^(.+?)(?:\s[—–-]\s|:\s|\.\s)/

/** Los renglones de afuera de los bloques de código: una lista adentro de un ``` es un ejemplo. */
function renglonesSinCodigo(texto: string): string[] {
  const afuera: string[] = []
  let dentro = false
  for (const renglon of texto.split('\n')) {
    if (CERCO_DE_CODIGO.test(renglon)) {
      dentro = !dentro
    } else if (!dentro) {
      afuera.push(renglon)
    }
  }
  return afuera
}

function conPatron(renglones: readonly string[], patron: RegExp): string[] {
  const encontrados: string[] = []
  for (const renglon of renglones) {
    const item = patron.exec(renglon)?.[1]
    if (item !== undefined) {
      encontrados.push(item)
    }
  }
  return encontrados
}

function limpiar(renglon: string): string {
  return renglon.replace(CASILLA, '').replace(MARCADO, '').replace(/\s+/g, ' ').trim()
}

/** Lo primero que dice la tarea, cortado donde empieza el detalle y sin pasarse de un renglón. */
export function tituloDeTarea(pedido: string): string {
  const cabeza = (CORTE_DEL_TITULO.exec(pedido)?.[1] ?? pedido).trim()
  if (cabeza.length <= TITULO) {
    return cabeza
  }
  const recortado = cabeza.slice(0, TITULO)
  const espacio = recortado.lastIndexOf(' ')
  // Cortar en la mitad de una palabra se lee peor que cortar antes; con el espacio muy al principio
  // (una ruta larga, un nombre de clase) no queda nada, y ahí se corta por el largo.
  const fin = espacio > TITULO / 2 ? recortado.slice(0, espacio) : recortado
  return `${fin.trimEnd()}…`
}

/**
 * Qué conviene delegar, si conviene delegar algo.
 *
 * `trabajando`: mientras el líder piensa no se propone nada. La lista todavía está creciendo, y una
 * ventana que cambia de filas sola mientras llega texto es un parpadeo, no una propuesta.
 */
export function propuestaDeDelegacion(
  ultimoDelAgente: string | null | undefined,
  { trabajando = false }: { readonly trabajando?: boolean } = {}
): PropuestaDeDelegacion | null {
  const texto = (ultimoDelAgente ?? '').trim()
  if (trabajando || texto === '' || !anunciaUnPlan(texto)) {
    return null
  }
  const renglones = renglonesSinCodigo(texto)
  const numeradas = conPatron(renglones, NUMERADA)
  // Las numeradas mandan: con «1.» y subpuntos «-», tomar las dos listas duplicaba cada tarea.
  const crudas = numeradas.length >= MINIMO_DE_TAREAS ? numeradas : conPatron(renglones, VINETA)
  const pedidos: string[] = []
  for (const cruda of crudas) {
    const pedido = limpiar(cruda)
    if (pedido.length >= PEDIDO_MINIMO && !pedidos.includes(pedido)) {
      pedidos.push(pedido)
    }
  }
  if (pedidos.length < MINIMO_DE_TAREAS) {
    return null
  }
  return {
    tareas: pedidos.slice(0, TOPE_DE_TAREAS).map((pedido, indice) => ({
      id: `t${indice + 1}`,
      titulo: tituloDeTarea(pedido),
      pedido
    }))
  }
}

/**
 * La propuesta en una cadena. Es con lo que se recuerda que ya la descartaste: en vivo el mensaje
 * del líder no tiene un id estable, y el mismo plan dos veces es la misma propuesta.
 */
export function firmaDeLaPropuesta(propuesta: PropuestaDeDelegacion): string {
  return propuesta.tareas.map((tarea) => tarea.pedido).join('\n')
}
