/**
 * Lo que el agente nombra y existe de verdad: un issue, un PR, una rama, un commit, un archivo.
 *
 * Pedido de Nico (01/11): «cuando se menciona un issue, un PR, una rama, te debe permitir
 * clickearlo y llevarte ahí, o si tocás por encima ves un flotante con cuál y demás». La idea es
 * que el chat deje de ser texto sobre el proyecto y pase a ser una superficie del proyecto: lo
 * que se nombra, se abre.
 *
 * La regla que gobierna todo esto: **no se marca lo que no se puede abrir**. Una referencia que
 * al tocarla no lleva a ningún lado es peor que texto plano, porque promete algo y falla. Por eso
 * las ramas se buscan contra la lista de ramas que de verdad tiene el repo, en vez de adivinar
 * por la forma del nombre: `feat/algo` parece una rama y `src/lib/algo` también, y la diferencia
 * no está en el texto.
 *
 * Los issues y los PR sí se reconocen por la forma (`#123`), porque el número es verificable
 * recién al abrirlo y no tenerlos marcados sería perder lo más nombrado del chat. Si el issue no
 * existe, la tarjeta flotante lo dice.
 */

/** Qué clase de cosa del proyecto se nombró. */
export type ClaseDeReferencia = 'issue' | 'pr' | 'rama' | 'commit'

export type Referencia = {
  readonly clase: ClaseDeReferencia
  /** Lo que se escribió, tal cual, para mostrarlo sin alterarlo. */
  readonly texto: string
  /** Con qué se busca: el número del issue, el nombre de la rama, el hash. */
  readonly id: string
}

/** El contexto del repo: sin esto, una rama es una cadena con una barra en el medio. */
export type LoQueExiste = {
  readonly ramas?: readonly string[]
}

/** Un hash de git suelto: de 7 a 40 en hexadecimal, y con al menos un dígito. */
const COMMIT = String.raw`\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b`

/**
 * Las ramas que larga Dolphin: `dolphin/<tarea>/<compañero>`, TRES tramos y ninguno con punto.
 *
 * Esta forma sí se reconoce sin consultar el repo, al revés que una rama cualquiera: son las
 * ramas de las que habla el chat. Una `feat/lo-que-sea` sigue necesitando la lista de ramas de
 * verdad, porque es indistinguible de una carpeta.
 *
 * Los tres tramos y el punto prohibido no son un capricho: con `dolphin/<lo que sea>` quedaban
 * marcados como rama `dolphin/latidos` y `dolphin/dolphin.sqlite`, que son la carpeta de trabajo
 * del propio Dolphin adentro del repo. Apareció mirando la consola de verdad, no en un test.
 */
const RAMA_DE_DOLPHIN = String.raw`\bdolphin/[\w-]+/[\w-]+(?:/[\w-]+)*\b`

/**
 * `#123`, `GH-123`, y las URL de GitHub.
 *
 * El `#` tiene que venir precedido de espacio, principio de línea o signo de puntuación de
 * apertura: `color #fff` no es un issue, y `tarea#4` tampoco.
 *
 * Cinco dígitos y no seis: `#121212` es un color, y con seis salía como el issue 121212 —pasó
 * hablando de una paleta (Nico, 07/11)—. Los que llevan letras (`#CFFF2E`) nunca entraron acá,
 * porque el grupo es de dígitos; el choque era solo con los hexadecimales de puros números, que
 * miden 6 u 8. Un repo con cien mil issues abiertos no es el caso de nadie que use esto.
 */
const NUMERO_SUELTO = String.raw`(?<![\p{L}\d#])#(\d{1,5})\b`
const NUMERO_CON_GH = String.raw`\bGH-(\d{1,6})\b`
const URL_ISSUE = String.raw`https?://github\.com/[\w.-]+/[\w.-]+/issues/(\d{1,6})\b`
const URL_PR = String.raw`https?://github\.com/[\w.-]+/[\w.-]+/pull/(\d{1,6})\b`
/** «PR #45», «pull request 45»: la palabra decide que es un PR y no un issue. */
const PR_CON_PALABRA = String.raw`\b(?:PR|pull request)\s+#?(\d{1,6})\b`

type Patron = {
  readonly clase: ClaseDeReferencia
  readonly re: string
  /** Qué grupo tiene el id; 0 es el texto entero. */
  readonly grupo: number
}

// El orden importa: lo más específico primero, porque gana el que matchea antes en el texto y,
// a igual posición, el que está antes en esta lista. «PR #45» tiene que ganarle a «#45».
const PATRONES: readonly Patron[] = [
  { clase: 'pr', re: URL_PR, grupo: 1 },
  { clase: 'issue', re: URL_ISSUE, grupo: 1 },
  { clase: 'pr', re: PR_CON_PALABRA, grupo: 1 },
  { clase: 'issue', re: NUMERO_CON_GH, grupo: 1 },
  { clase: 'issue', re: NUMERO_SUELTO, grupo: 1 },
  { clase: 'rama', re: RAMA_DE_DOLPHIN, grupo: 0 },
  { clase: 'commit', re: COMMIT, grupo: 0 }
]

/**
 * Cada patrón se busca por su cuenta y después se resuelven los choques.
 *
 * La alternativa —un solo regex con todos los patrones entre paréntesis— obliga a adivinar qué
 * grupo es de qué patrón contando los paréntesis internos de cada uno, y eso se rompe en cuanto
 * alguien agrega un patrón sin grupo: pasó al sumar las ramas de Dolphin y dejó de detectar los
 * commits, en silencio. Los textos de un chat son cortos: siete barridos no se notan.
 */
const COMPILADOS = PATRONES.map((p) => ({ ...p, re: new RegExp(p.re, 'gu') }))

/** Dónde arranca y termina una referencia adentro de un texto. */
export type Hallazgo = {
  readonly desde: number
  readonly hasta: number
} & Referencia

/** Un hallazgo mientras se resuelven los choques: `orden` dice de qué patrón salió. */
type Candidato = Hallazgo & { readonly orden: number }

/**
 * Las ramas que aparecen en el texto, buscadas por nombre exacto.
 *
 * Se buscan de la más larga a la más corta: con `main` y `main-viejo` en el repo, buscar `main`
 * primero partiría `main-viejo` al medio y dejaría un `-viejo` suelto al lado de una referencia
 * que lleva a otro lado.
 */
function ramasEnElTexto(texto: string, ramas: readonly string[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = []
  for (const rama of [...ramas].sort((a, b) => b.length - a.length)) {
    if (rama.length < 2) {
      continue
    }
    let desde = texto.indexOf(rama)
    while (desde !== -1) {
      const antes = texto[desde - 1] ?? ' '
      const despues = texto[desde + rama.length] ?? ' '
      // Pegada a una letra, a un dígito o a una barra es otra cosa: `origin/main` no es `main`,
      // y `mainframe` tampoco.
      const sueltaDeVerdad = !/[\p{L}\d/_-]/u.test(antes) && !/[\p{L}\d/_-]/u.test(despues)
      if (sueltaDeVerdad) {
        hallazgos.push({
          clase: 'rama',
          texto: rama,
          id: rama,
          desde,
          hasta: desde + rama.length
        })
      }
      desde = texto.indexOf(rama, desde + rama.length)
    }
  }
  return hallazgos
}

/**
 * Todas las referencias de un texto, en orden y sin superponerse.
 *
 * Cuando dos se pisan gana la que empieza antes; a igual comienzo, la más larga. Así
 * `https://github.com/o/r/issues/12` sale entera y no como una URL con un `#12` adentro.
 */
export function referenciasEn(texto: string, existe: LoQueExiste = {}): Hallazgo[] {
  const crudos: Candidato[] = []
  for (const [orden, patron] of COMPILADOS.entries()) {
    patron.re.lastIndex = 0
    for (const encontrado of texto.matchAll(patron.re)) {
      const id = patron.grupo === 0 ? encontrado[0] : encontrado[patron.grupo]
      if (!id) {
        continue
      }
      crudos.push({
        clase: patron.clase,
        texto: encontrado[0],
        id,
        desde: encontrado.index ?? 0,
        hasta: (encontrado.index ?? 0) + encontrado[0].length,
        orden
      })
    }
  }
  crudos.push(...ramasEnElTexto(texto, existe.ramas ?? []).map((r) => ({ ...r, orden: -1 })))

  // Primero el que empieza antes; a igual comienzo, el más largo; y a igual largo, el patrón más
  // específico (el que está antes en PATRONES), para que «PR #45» le gane a «#45».
  crudos.sort((a, b) => a.desde - b.desde || b.hasta - a.hasta || a.orden - b.orden)
  const limpios: Hallazgo[] = []
  for (const { orden: _orden, ...hallazgo } of crudos) {
    const ultimo = limpios.at(-1)
    if (!ultimo || hallazgo.desde >= ultimo.hasta) {
      limpios.push(hallazgo)
    }
  }
  return limpios
}

/** El rótulo corto de una referencia, para la pastilla: un hash largo se muestra cortado. */
export function rotuloDe(referencia: Referencia): string {
  if (referencia.clase === 'commit') {
    return referencia.id.slice(0, 7)
  }
  if (referencia.clase === 'issue' || referencia.clase === 'pr') {
    return `#${referencia.id}`
  }
  return referencia.texto
}
