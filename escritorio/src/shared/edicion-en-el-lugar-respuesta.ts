/**
 * Leer lo que contestó el modelo cuando se edita con IA en el lugar (Cmd+K).
 *
 * Está en `shared` porque lo necesitan los dos lados: el proceso principal, que es el que recibe
 * la salida cruda del agente, y el editor, que es el que la escribe adentro del archivo.
 *
 * Es la pieza frágil de la función. Un modelo contesta lo que se le canta —a veces el código
 * pelado, a veces en una cerca con el nombre del lenguaje, a veces con «Acá tenés:» adelante y una
 * explicación atrás— y si uno escribe eso tal cual adentro del archivo, le mete texto en prosa en
 * medio del código.
 */

/** La cerca de un bloque de código: tres o más comillas invertidas, o tres o más virgulillas. */
const CERCA = /^([`~]{3,})[^\n`]*$/

/**
 * El código que trae una respuesta del modelo.
 *
 * Si hay bloques cercados, devuelve el de más líneas, y entre empatados el último: con «acá está
 * el cambio» + bloque + «¿querés que lo aplique?» el bloque es la respuesta, y cuando hay varios
 * los chicos suelen ser nombres de archivo o comandos sueltos, de una línea.
 *
 * Por líneas y no por caracteres: elegir el más largo en caracteres hacía ganar a `src/a.ts` —ocho
 * letras— contra dos líneas de código de siete. El último entre empatados porque el modelo pone la
 * explicación antes y el código al final.
 *
 * Si no hay ninguno, devuelve el texto entero recortado: un modelo que contesta sólo el código es
 * el caso bueno y no hay que castigarlo.
 *
 * La cerca de cierre tiene que ser al menos tan larga como la de apertura y del mismo carácter,
 * que es la regla de Markdown. Sin eso, un bloque que adentro tiene ``` (código que habla de
 * markdown, que en este repo es la mitad) se cortaba al medio.
 */
export function codigoDeLaRespuesta(respuesta: string): string {
  const bloques = bloquesCercados(respuesta).map((bloque) => bloque.codigo)
  if (bloques.length === 0) {
    return respuesta.trim()
  }
  const lineasDe = (bloque: string): number => bloque.split('\n').length
  return bloques.reduce((mayor, bloque) => (lineasDe(bloque) >= lineasDe(mayor) ? bloque : mayor))
}

/** Un bloque cercado: lo que dice su cerca de apertura, su contenido y las líneas que ocupa. */
type BloqueCercado = { info: string; codigo: string; desde: number; hasta: number }

function bloquesCercados(respuesta: string): BloqueCercado[] {
  const lineas = respuesta.split('\n')
  const bloques: BloqueCercado[] = []
  let abierta: { marca: string; info: string; desde: number } | null = null
  for (const [indice, linea] of lineas.entries()) {
    const corte = CERCA.exec(linea.trim())
    if (!abierta) {
      if (corte) {
        const marca = corte[1]!
        abierta = { marca, info: linea.trim().slice(marca.length).trim(), desde: indice }
      }
      continue
    }
    const cierre = linea.trim()
    const mismaMarca = cierre[0] === abierta.marca[0]
    if (
      corte &&
      mismaMarca &&
      cierre.length >= abierta.marca.length &&
      cierre === cierre[0]!.repeat(cierre.length)
    ) {
      bloques.push({
        info: abierta.info,
        codigo: lineas.slice(abierta.desde + 1, indice).join('\n'),
        desde: abierta.desde,
        hasta: indice
      })
      abierta = null
    }
  }
  return bloques
}

/**
 * La etiqueta de la cerca con la que el modelo marca un reemplazo (```` ```reemplazo ````).
 *
 * Cmd+K recibe dos clases de pedido: «hacé esto async» y «¿para qué sirve esta línea?». El editor
 * tiene que saber cuál volvió sin leer lo que dice la prosa, porque aceptar una respuesta como si
 * fuera código escribe esa respuesta adentro del archivo. Por eso el pedido le dice al modelo que
 * un cambio va en un bloque con esta etiqueta y una respuesta, sin él.
 */
export const ETIQUETA_DEL_REEMPLAZO = 'reemplazo'

/** Lo que volvió de un Cmd+K: un cambio para aceptar, o una respuesta para leer. */
export type RespuestaDeEdicion =
  | { tipo: 'edicion'; codigo: string }
  | { tipo: 'respuesta'; texto: string }

/**
 * Qué trajo la respuesta: un reemplazo o una respuesta.
 *
 * - Un bloque con la etiqueta del reemplazo es un cambio; si hay varios, vale el último.
 * - Una respuesta que es entera un único bloque cercado, sin nada de prosa alrededor, también es un
 *   cambio: es el modelo que contestó bien pero con el nombre del lenguaje en vez de la etiqueta.
 * - Cualquier otra cosa es una respuesta, aunque traiga ejemplos de código: se lee, no se aplica.
 *
 * Equivocarse para este lado es barato —la persona lee algo que podría haber aceptado y lo pide de
 * nuevo—; para el otro, escribe prosa en su archivo.
 */
export function leerRespuestaDeEdicion(respuesta: string): RespuestaDeEdicion {
  const bloques = bloquesCercados(respuesta)
  const marcados = bloques.filter(
    (bloque) => bloque.info.split(/\s+/)[0]?.toLowerCase() === ETIQUETA_DEL_REEMPLAZO
  )
  const marcado = marcados.at(-1)
  if (marcado) {
    return { tipo: 'edicion', codigo: marcado.codigo }
  }
  const lineas = respuesta.split('\n')
  const unico = bloques.length === 1 ? bloques[0]! : null
  const fuera = unico
    ? [...lineas.slice(0, unico.desde), ...lineas.slice(unico.hasta + 1)].join('\n').trim()
    : null
  if (unico && fuera === '') {
    return { tipo: 'edicion', codigo: unico.codigo }
  }
  return { tipo: 'respuesta', texto: respuesta.trim() }
}
