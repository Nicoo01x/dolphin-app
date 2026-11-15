/**
 * Reemplazar en todo el proyecto.
 *
 * Buscar en todo el proyecto ya existía (`fs:search`, ripgrep embebido, con regex, mayúsculas y
 * palabra entera). Lo que faltaba era la otra mitad: escribir.
 *
 * Todo lo que decide QUÉ texto queda está acá, sin tocar disco, porque es la parte que puede
 * arruinar un repo entero de una sola vez y tiene que poder probarse con casos de verdad. El
 * módulo de main hace lo otro: resolver permisos de cada ruta, leer y escribir.
 *
 * Las semánticas son las de VS Code a propósito —`$1`, `$&`, `$$`— porque es lo que la gente ya
 * tiene en los dedos, y porque `String.replace` de JavaScript hace lo mismo con `$`: escribir
 * nuestra propia convención sería distinto de las dos cosas que alguien puede esperar.
 */

export type OpcionesDeReemplazo = {
  readonly consulta: string
  readonly reemplazo: string
  readonly conRegex?: boolean
  readonly distingueMayusculas?: boolean
  readonly palabraEntera?: boolean
}

export type ReemplazoEnTexto = {
  readonly texto: string
  readonly cuantos: number
}

/** Lo que una consulta mal escrita devuelve, para poder decirlo sin reventar nada. */
export class ConsultaInvalida extends Error {}

const ESPECIALES = /[.*+?^${}()|[\]\\]/g

/** Un texto literal, convertido en una expresión que se busca a sí misma. */
export function comoLiteral(texto: string): string {
  return texto.replace(ESPECIALES, '\\$&')
}

/**
 * La expresión que se va a usar, ya con las banderas.
 *
 * Why `m` siempre: `^` y `$` en una búsqueda de proyecto significan principio y fin de LÍNEA, que
 * es lo que significan en el buscador de cualquier editor. Sin `m` sólo matchean el principio y
 * el fin del archivo entero y la consulta no encuentra nada, sin decir por qué.
 */
export function expresionDe(opciones: OpcionesDeReemplazo): RegExp {
  if (opciones.consulta === '') {
    throw new ConsultaInvalida('la consulta está vacía')
  }
  const cuerpo = opciones.conRegex ? opciones.consulta : comoLiteral(opciones.consulta)
  // `\b` alrededor de una expresión con alternativas (`a|b`) sólo ataría la primera y la última:
  // el grupo lo evita.
  const conPalabra = opciones.palabraEntera ? `\\b(?:${cuerpo})\\b` : cuerpo
  const banderas = `gm${opciones.distingueMayusculas ? '' : 'i'}`
  try {
    return new RegExp(conPalabra, banderas)
  } catch (error) {
    throw new ConsultaInvalida(error instanceof Error ? error.message : String(error))
  }
}

/**
 * El reemplazo aplicado a un texto, y cuántas veces.
 *
 * Why se cuenta con un callback en vez de comparar el antes y el después: un reemplazo puede dar
 * exactamente el mismo texto —cambiar `color` por `color`, o una regex que matchea lo que ya está
 * escrito— y ahí «no cambió nada» no es «no encontró nada». La pantalla necesita distinguirlos
 * para no decir que no encontró lo que sí encontró.
 */
export function reemplazarEnTexto(texto: string, opciones: OpcionesDeReemplazo): ReemplazoEnTexto {
  const expresion = expresionDe(opciones)
  let cuantos = 0
  const salida = texto.replace(expresion, (...args) => {
    cuantos += 1
    return expandirReemplazo(opciones.reemplazo, args, Boolean(opciones.conRegex))
  })
  return { texto: salida, cuantos }
}

/**
 * `$1`, `$&` y `$$` resueltos a mano.
 *
 * Why a mano y no dejándoselo a `String.replace`: sin regex, el reemplazo es TEXTO LITERAL. Quien
 * busca `precio` y escribe `$5` quiere que diga `$5`, no el quinto grupo de una expresión que no
 * escribió. Dejar pasar el `$` ahí convierte una búsqueda literal en una sorpresa silenciosa en
 * cada archivo del repo.
 */
export function expandirReemplazo(
  plantilla: string,
  argumentosDeReplace: readonly unknown[],
  conRegex: boolean
): string {
  if (!conRegex) {
    return plantilla
  }
  const completo = String(argumentosDeReplace[0] ?? '')
  // replace entrega (match, ...grupos, posición, textoEntero) y a veces un objeto de nombrados.
  const grupos = argumentosDeReplace
    .slice(1, -2)
    .filter((valor) => typeof valor === 'string' || valor === undefined) as (string | undefined)[]
  return plantilla.replace(/\$(\$|&|\d{1,2})/g, (_todo, cual: string) => {
    if (cual === '$') {
      return '$'
    }
    if (cual === '&') {
      return completo
    }
    const indice = Number(cual)
    // Un `$7` cuando la expresión tiene tres grupos se deja tal cual, como hace JavaScript: es
    // casi siempre un `$` literal mal escapado, y borrarlo pierde texto.
    if (indice < 1 || indice > grupos.length) {
      return `$${cual}`
    }
    return grupos[indice - 1] ?? ''
  })
}

/** Cómo le fue a un archivo. Vive acá y no en main porque el preload también lo nombra. */
export type ArchivoReemplazado = {
  readonly ruta: string
  readonly cuantos: number
  /** En palabras, cuando ese archivo no se pudo tocar. Los demás siguen. */
  readonly error?: string
}

export type ResultadoDeReemplazo = {
  readonly archivos: readonly ArchivoReemplazado[]
  readonly total: number
}
