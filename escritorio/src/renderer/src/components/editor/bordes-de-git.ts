import { diffLines } from 'diff'

/**
 * El borde de git: qué líneas del archivo abierto cambiaron desde HEAD, y cómo devolver una sola.
 *
 * Es lo que un dev mira todo el día sin pensarlo —la rayita verde o naranja al lado del número de
 * línea— y lo que convierte esa rayita en algo útil no es pintarla: es poder revertir UN pedazo
 * sin perder los otros nueve cambios del archivo.
 *
 * Acá no hay Monaco ni decoraciones: sólo texto entrando y texto saliendo, porque la parte que
 * puede perder trabajo es ésta. Pintar es fácil de ver andar; revertir el pedazo equivocado es
 * silencioso.
 */

export type TipoDeHunk = 'agregado' | 'cambiado' | 'borrado'

export type Hunk = {
  readonly tipo: TipoDeHunk
  /** Primera línea del hunk en el documento ACTUAL, 1-based. */
  readonly desde: number
  /**
   * Última línea del hunk en el documento actual, 1-based e inclusive.
   * En un `borrado` vale `desde - 1`: no hay ninguna línea para marcar, porque lo que había se
   * fue. El borde dibuja ahí una marca entre dos líneas, que es lo que hace VS Code.
   */
  readonly hasta: number
  /** Lo que decía HEAD en ese lugar. Es lo que se repone al revertir. */
  readonly original: readonly string[]
}

/**
 * El texto con todos sus fines de línea como `\n`.
 *
 * Why: con `core.autocrlf=true` —lo que instala Git for Windows— HEAD guarda `\n` y el archivo en
 * disco tiene `\r\n`. Comparando sin normalizar, cada línea difiere en su `\r` y el borde marca
 * el archivo entero como cambiado aunque `git status` diga que no hay nada.
 */
function conSaltosLf(texto: string): string {
  return texto.replace(/\r\n/g, '\n')
}

/** El fin de línea del documento: el que hay que usar para todo lo que se le escriba. */
function finDeLineaDe(texto: string): '\r\n' | '\n' {
  return texto.includes('\r\n') ? '\r\n' : '\n'
}

/** Las líneas de un texto, sin inventar una línea vacía al final por el salto final. */
export function lineasDe(texto: string): string[] {
  if (texto === '') {
    return []
  }
  const partes = conSaltosLf(texto).split('\n')
  if (partes.at(-1) === '') {
    partes.pop()
  }
  return partes
}

/**
 * Los pedazos cambiados entre lo que dice HEAD y lo que hay en pantalla.
 *
 * Un borrado seguido de un agregado en el mismo lugar es UN cambio y no dos: en el borde son la
 * misma rayita naranja, y revertirlo tiene que reponer lo viejo y sacar lo nuevo de una vez. Si
 * se tratan por separado, revertir «el agregado» deja el archivo sin la línea original.
 */
export function hunksDe(enHead: string, actual: string): Hunk[] {
  // Un archivo cuyo único cambio es el fin de línea no tiene nada que revertir línea por línea.
  const trozos = diffLines(conSaltosLf(enHead), conSaltosLf(actual))
  const hunks: Hunk[] = []
  let lineaActual = 1
  let i = 0
  while (i < trozos.length) {
    const trozo = trozos[i]
    if (!trozo) {
      break
    }
    if (!trozo.added && !trozo.removed) {
      lineaActual += lineasDe(trozo.value).length
      i += 1
      continue
    }
    const siguiente = trozos[i + 1]
    const esReemplazo = Boolean(trozo.removed && siguiente?.added)
    const quitadas = trozo.removed ? lineasDe(trozo.value) : []
    const puestas = esReemplazo
      ? lineasDe(siguiente?.value ?? '')
      : trozo.added
        ? lineasDe(trozo.value)
        : []

    if (puestas.length === 0) {
      // Se borró y no se puso nada: la marca va entre la línea de antes y la de después.
      hunks.push({
        tipo: 'borrado',
        desde: lineaActual,
        hasta: lineaActual - 1,
        original: quitadas
      })
    } else {
      hunks.push({
        tipo: quitadas.length === 0 ? 'agregado' : 'cambiado',
        desde: lineaActual,
        hasta: lineaActual + puestas.length - 1,
        original: quitadas
      })
      lineaActual += puestas.length
    }
    i += esReemplazo ? 2 : 1
  }
  return hunks
}

/**
 * El archivo con ESE pedazo como estaba en HEAD, y el resto como está.
 *
 * Why devuelve el texto entero y no una edición de Monaco: así se prueba sin editor, y quien
 * llama decide si lo aplica con `executeEdits` (que conserva el deshacer) o de otra forma.
 *
 * El salto de línea final se conserva como estaba: un archivo que terminaba con salto y vuelve
 * sin él aparece como una línea cambiada de más en cada herramienta de git. Salvo que el pedazo
 * llegue al final del archivo: ahí el salto final es parte de lo que se revierte, y manda el de
 * HEAD (`enHead`). Escribir en la línea vacía del final se come el salto; revertirlo lo devuelve.
 *
 * Todo lo que se escribe sale con el fin de línea del documento: un `\n` suelto adentro de un
 * archivo `\r\n` es un cambio que nadie hizo.
 */
export function revertirHunk(actual: string, hunk: Hunk, enHead?: string): string {
  const eol = finDeLineaDe(actual)
  const lineas = lineasDe(actual)
  const desde = hunk.desde - 1
  const cuantas = Math.max(0, hunk.hasta - hunk.desde + 1)
  if (desde < 0 || desde > lineas.length) {
    throw new RangeError(
      `el hunk empieza en la línea ${hunk.desde} y el archivo tiene ${lineas.length}`
    )
  }
  const salida = [...lineas.slice(0, desde), ...hunk.original, ...lineas.slice(desde + cuantas)]
  const llegaAlFinal = desde + cuantas >= lineas.length
  const terminaConSalto =
    llegaAlFinal && enHead !== undefined ? enHead.endsWith('\n') : actual.endsWith('\n')
  return salida.join(eol) + (terminaConSalto && salida.length > 0 ? eol : '')
}

/** El hunk que toca una línea, para el «revertir» del menú del borde. */
export function hunkEnLaLinea(hunks: readonly Hunk[], linea: number): Hunk | null {
  return (
    hunks.find((hunk) =>
      // Un borrado no ocupa ninguna línea: se agarra desde la de arriba o la de abajo del corte.
      hunk.tipo === 'borrado'
        ? linea === hunk.desde || linea === hunk.desde - 1
        : linea >= hunk.desde && linea <= hunk.hasta
    ) ?? null
  )
}
