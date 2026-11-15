/**
 * La traducción entre lo que dice un servidor de lenguaje y lo que entiende Monaco.
 *
 * **Las posiciones de LSP arrancan en 0 y las de Monaco en 1.** Es la fuente del 90 % de los
 * errores de una integración: todo aparece corrido una línea y una columna, y como «corrido uno»
 * se ve casi bien, pasa las pruebas a ojo. Por eso la conversión vive acá sola, con sus tests, y
 * nadie la escribe a mano en el medio de un proveedor.
 *
 * Puro y sin importar Monaco: los tipos que devuelve son los literales que Monaco acepta, así que
 * esto se puede probar sin montar un editor.
 */

/** Una posición de LSP: línea y carácter, desde 0. */
export type PosicionLsp = { readonly line: number; readonly character: number }
export type RangoLsp = { readonly start: PosicionLsp; readonly end: PosicionLsp }

/** Un rango de Monaco: línea y columna, desde 1. */
export type RangoMonaco = {
  readonly startLineNumber: number
  readonly startColumn: number
  readonly endLineNumber: number
  readonly endColumn: number
}

export function rangoAMonaco(rango: RangoLsp): RangoMonaco {
  return {
    startLineNumber: rango.start.line + 1,
    startColumn: rango.start.character + 1,
    endLineNumber: rango.end.line + 1,
    endColumn: rango.end.character + 1
  }
}

export function posicionDesdeMonaco(posicion: {
  readonly lineNumber: number
  readonly column: number
}): PosicionLsp {
  return { line: posicion.lineNumber - 1, character: posicion.column - 1 }
}

/**
 * La severidad de un diagnóstico.
 *
 * LSP numera 1 error, 2 warning, 3 info, 4 hint; Monaco usa 8, 4, 2, 1 —sus `MarkerSeverity`—, que
 * no es el mismo orden ni la misma escala. Un diagnóstico sin severidad es un error para LSP, que
 * es lo que dice su especificación, y no una pista.
 */
export function severidadAMonaco(severidad: number | undefined): 1 | 2 | 4 | 8 {
  // Aparte del switch y no en su `default`: «no vino severidad» no es lo mismo que «vino un
  // número que no conozco», aunque las dos terminen en error, y así lo dice el tipo.
  if (severidad === undefined) {
    return 8
  }
  switch (severidad) {
    case 2:
      return 4
    case 3:
      return 2
    case 4:
      return 1
    default:
      return 8
  }
}

/** Lo que Monaco pide para pintar un subrayado. */
export type MarcaMonaco = RangoMonaco & {
  readonly message: string
  readonly severity: 1 | 2 | 4 | 8
  readonly source?: string
  readonly code?: string
}

export function diagnosticoAMarca(diagnostico: {
  readonly range: RangoLsp
  readonly message: string
  readonly severity?: number
  readonly source?: string
  readonly code?: string | number
}): MarcaMonaco {
  return {
    ...rangoAMonaco(diagnostico.range),
    message: diagnostico.message,
    severity: severidadAMonaco(diagnostico.severity),
    ...(diagnostico.source ? { source: diagnostico.source } : {}),
    ...(diagnostico.code === undefined ? {} : { code: String(diagnostico.code) })
  }
}

/**
 * El texto de un hover.
 *
 * Un servidor puede contestar una cadena, un `MarkupContent`, o una lista de las dos cosas
 * mezcladas —todas las formas existen en servidores reales—, y lo marcado como código viene con su
 * lenguaje aparte. Lo que sale es markdown, que es lo que Monaco dibuja.
 */
export function hoverAMarkdown(contenido: unknown): string {
  if (typeof contenido === 'string') {
    return contenido
  }
  if (Array.isArray(contenido)) {
    return contenido.map(hoverAMarkdown).filter(Boolean).join('\n\n')
  }
  if (!contenido || typeof contenido !== 'object') {
    return ''
  }
  const pieza = contenido as { value?: unknown; language?: unknown; kind?: unknown }
  if (typeof pieza.value !== 'string') {
    return ''
  }
  return typeof pieza.language === 'string' && pieza.language
    ? `\`\`\`${pieza.language}\n${pieza.value}\n\`\`\``
    : pieza.value
}

/**
 * La clase de un completado.
 *
 * LSP numera del 1 (Text) al 25 (TypeParameter) en SU orden; Monaco tiene otro. Esta tabla es la
 * correspondencia por NOMBRE, no por número: aparearlas por número pone «Method» donde va «File».
 */
const CLASE_DE_COMPLETADO: Readonly<Record<number, number>> = {
  1: 18, // Text
  2: 0, // Method
  3: 1, // Function
  4: 2, // Constructor
  5: 3, // Field
  6: 4, // Variable
  7: 5, // Class
  8: 7, // Interface
  9: 8, // Module
  10: 9, // Property
  11: 12, // Unit
  12: 13, // Value
  13: 15, // Enum
  14: 17, // Keyword
  15: 27, // Snippet
  16: 19, // Color
  17: 20, // File
  18: 21, // Reference
  19: 23, // Folder
  20: 16, // EnumMember
  21: 14, // Constant
  22: 6, // Struct
  23: 10, // Event
  24: 11, // Operator
  25: 24 // TypeParameter
}

/** La clase de Monaco para una de LSP; sin clase, «Property», que es el neutro de Monaco. */
export function claseDeCompletadoAMonaco(clase: number | undefined): number {
  return clase === undefined ? 9 : (CLASE_DE_COMPLETADO[clase] ?? 9)
}

/**
 * El `uri` de un archivo tal como lo pide LSP, desde una ruta del sistema.
 *
 * Es EL lugar donde se arma: abrir, cambiar, cerrar y cada pregunta usan esto. Hasta el 11/11 las
 * preguntas salían con un `file://D:/…` armado a mano y el archivo se había abierto como
 * `file:///D%3A/…`, así que en Windows el servidor contestaba por un documento que no conocía.
 */
export function uriDeArchivo(ruta: string): string {
  // Why a mano y no `pathToFileURL`: esto corre también en el renderer, donde no hay `node:url`.
  // Y why se escapa por segmento: una ruta con `#` o `?` sin escapar corta el URI, y en Windows la
  // barra invertida no es un separador de URI.
  const normalizada = ruta.replace(/\\/g, '/')
  const conBarra = normalizada.startsWith('/') ? normalizada : `/${normalizada}`
  return `file://${conBarra.split('/').map(encodeURIComponent).join('/').replace(/^%2F/, '')}`
}

/** La ruta del sistema que nombra un `uri` de LSP. */
export function rutaDeUri(uri: string): string {
  const sinEsquema = uri.replace(/^file:\/\//, '')
  const decodificada = sinEsquema
    .split('/')
    .map((parte) => {
      try {
        return decodeURIComponent(parte)
      } catch {
        return parte
      }
    })
    .join('/')
  // `/C:/Users/...` es una ruta de Windows con una barra de más adelante.
  return /^\/[a-zA-Z]:/.test(decodificada) ? decodificada.slice(1) : decodificada
}

/**
 * Si dos rutas nombran el mismo archivo, vengan como vengan.
 *
 * Los servidores devuelven la ruta a su manera: typescript-language-server, por ejemplo, contesta
 * `file:///d%3A/…` con la unidad en minúscula aunque se le haya abierto `D:`. Se compara con las
 * barras de un solo tipo y la letra de unidad sin distinguir mayúsculas; el resto de la ruta sí
 * distingue, porque en Linux `A.ts` y `a.ts` son dos archivos.
 */
export function mismaRuta(una: string, otra: string): boolean {
  return paraComparar(una) === paraComparar(otra)
}

function paraComparar(ruta: string): string {
  const conBarras = ruta.replace(/\\/g, '/').replace(/^\/([a-zA-Z]:)/, '$1')
  return /^[a-zA-Z]:/.test(conBarras) ? conBarras[0].toLowerCase() + conBarras.slice(1) : conBarras
}

/**
 * Los campos de algo que mandó un servidor, para leerlos de a uno con `typeof`. Lo que llega por
 * JSON-RPC es `unknown` de verdad: un servidor con un bug puede mandar cualquier forma, y leerlo
 * con un cast es creerle sin mirar.
 */
export function camposDe(valor: unknown): Readonly<Record<string, unknown>> {
  return esObjeto(valor) ? valor : {}
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
}

function esPosicion(valor: unknown): valor is PosicionLsp {
  return esObjeto(valor) && typeof valor.line === 'number' && typeof valor.character === 'number'
}

export function esRangoLsp(valor: unknown): valor is RangoLsp {
  return esObjeto(valor) && esPosicion(valor.start) && esPosicion(valor.end)
}

/** De Monaco a LSP, el camino inverso de `rangoAMonaco`. */
export function rangoDesdeMonaco(rango: RangoMonaco): RangoLsp {
  return {
    start: { line: rango.startLineNumber - 1, character: rango.startColumn - 1 },
    end: { line: rango.endLineNumber - 1, character: rango.endColumn - 1 }
  }
}

/** De la severidad de una marca de Monaco a la de LSP, para devolverle sus diagnósticos. */
export function severidadDesdeMonaco(severidad: number): 1 | 2 | 3 | 4 {
  switch (severidad) {
    case 4:
      return 2
    case 2:
      return 3
    case 1:
      return 4
    default:
      return 1
  }
}
