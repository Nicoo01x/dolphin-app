/**
 * Lo que escriben Claude y los agentes, partido para leerse de un vistazo: lo que es un dato sale
 * como insignia de color y el resto queda como texto. Un número con su unidad, plata, un tiempo,
 * un término citado o un modelo se encuentran sin leer el párrafo entero.
 *
 * Es la misma regla que la consola de Dolphin (dolphin-app, ui/src/lib/insignias.ts), sin los
 * archivos ni el código: el chat ya los marca como código o como enlace. Determinista y barato; un
 * número suelto («5 a 8») no es insignia, porque sin unidad no dice qué mide.
 */

/** Qué mide un dato: cada clase tiene su color, para separarlas de un vistazo. */
export type ClaseDeInsignia =
  | 'porcentaje'
  | 'plata'
  | 'tiempo'
  | 'cantidad'
  | 'cita'
  | 'modelo'
  | 'agregado'
  | 'quitado'
  | 'color'

export type Trozo =
  | { readonly tipo: 'texto'; readonly valor: string }
  | { readonly tipo: 'insignia'; readonly valor: string; readonly clase: ClaseDeInsignia }

/** Las marcas que tienen logo en `./logos`; el chip de un modelo lo lleva adelante. */
export type Marca =
  | 'claude'
  | 'openai'
  | 'gemini'
  | 'deepseek'
  | 'qwen'
  | 'mistral'
  | 'grok'
  | 'ollama'
  | 'copilot'

/**
 * De quién es el modelo que se nombró. Es la misma tabla que `logoDeModelo` en la consola
 * (ui/src/lib/datos.ts). Solo se llama con algo que ya coincidió con el patrón de modelos, así que
 * lo que no cae en ninguna rama es de Claude (Opus, Sonnet, Haiku, Fable).
 */
export function marcaDeModelo(valor: string): Marca {
  const m = valor.toLowerCase()
  if (m.includes('gpt') || m.includes('codex') || m.includes('openai')) {
    return 'openai'
  }
  if (m.includes('gemini')) {
    return 'gemini'
  }
  if (m.includes('deepseek')) {
    return 'deepseek'
  }
  if (m.includes('qwen')) {
    return 'qwen'
  }
  if (m.includes('mistral')) {
    return 'mistral'
  }
  if (m.includes('grok')) {
    return 'grok'
  }
  if (m.includes('llama')) {
    return 'ollama'
  }
  if (m.includes('copilot')) {
    return 'copilot'
  }
  return 'claude'
}

/** La clase de un dato con número, por lo que trae escrito. */
export function claseDeDato(valor: string): ClaseDeInsignia {
  const limpio = valor.trim()
  if (limpio.endsWith('%')) {
    return 'porcentaje'
  }
  if (/US\$|USD|\$|€/.test(limpio)) {
    return 'plata'
  }
  if (/\d\s?(?:ms|s|seg|min|h|horas?|hours?|d[ií]as?|days?)$/i.test(limpio)) {
    return 'tiempo'
  }
  return 'cantidad'
}

// Las unidades que dicen qué mide un número; las palabras van completas.
const UNIDAD = String.raw`(?:%|ms|s|seg|min|h|horas?|hours?|d[ií]as?|days?|bytes?|KB|MB|GB|px|k?tokens?|l[ií]neas?|lines?|archivos?|files?|tests?|commits?|ramas?|branches?|fases?|intentos?|vueltas?|veces|x)`
// Los miles pueden venir separados por un espacio (común, fino o duro): «16 442 bytes» es un dato.
const NUMERO = String.raw`(?:\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*)`

/**
 * El resumen de un diff: `+809/−255`.
 *
 * Va primero porque sus dos mitades sueltas no son nada —`809` sin unidad no dice qué mide— y
 * juntas son lo único que cuenta de qué tamaño fue un commit (pedido de Nico, 07/11: que los
 * commits se pongan de color en el chat). Acepta el menos de verdad (−), el guion del teclado y la
 * raya, que es lo que los agentes escriben indistintamente.
 */
const DIFF = String.raw`(?<![\p{L}\d])\+${NUMERO}\s?/\s?[−–-]${NUMERO}(?![\p{L}\d])`

/**
 * Un color en hexadecimal: `#CFFF2E`, `#121212`, `#fff`.
 *
 * Hablando de una paleta, el chat se llena de códigos que no dicen nada hasta que los pegás en
 * algún lado. Con la muestra al lado se ven (pedido de Nico, 07/11). Las cuatro formas que acepta
 * CSS, de la más larga a la más corta para que `#003D1BFF` no salga partido en `#003D1B` + `FF`.
 */
const COLOR = String.raw`(?<![\p{L}\d#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b`

const PATRONES: readonly {
  readonly clase: ClaseDeInsignia | 'dato' | 'diff'
  readonly re: string
}[] = [
  { clase: 'color', re: COLOR },
  { clase: 'diff', re: DIFF },
  { clase: 'cita', re: String.raw`«[^»\n]{1,60}»` },
  // Plata antes que números: «US$ 0,29» es un dato entero, no «0,29» suelto.
  { clase: 'dato', re: String.raw`(?:US\$|USD|\$|€)\s?${NUMERO}` },
  // Un rango («5-10 min») va entero; el signo cuenta solo si no viene pegado a otro número o palabra,
  // o «5-10 min» se leía «-10 min».
  {
    clase: 'dato',
    re: String.raw`(?<![\p{L}\d])[+−-]?${NUMERO}(?:\s?[-–]\s?${NUMERO})?\s?${UNIDAD}(?![\p{L}\d])`
  },
  {
    clase: 'modelo',
    re: String.raw`\b(?:Claude(?: Code| (?:Opus|Sonnet|Haiku|Fable)(?: \d+(?:\.\d+)?)?)?|(?:Opus|Sonnet|Haiku|Fable)(?: \d+(?:\.\d+)?)?|GPT(?:-\d[\w.]*)?|Codex|Gemini|DeepSeek|Qwen|Grok|Copilot|Mistral|Llama)\b`
  }
]

const BUSCADOR = new RegExp(PATRONES.map((p) => `(${p.re})`).join('|'), 'gu')

/**
 * `+809/−255` son DOS insignias: lo que entró y lo que salió, cada una con su color.
 *
 * Una sola insignia para el par obligaría a elegir un color para las dos, y el color es justamente
 * lo que distingue agregar de borrar. La barra queda como texto: separa, no es un dato.
 */
function partirDiff(crudo: string): Trozo[] {
  const partes = crudo.match(/^(\+[^/]+?)(\s*\/\s*)(.+)$/)
  if (!partes) {
    return [{ tipo: 'insignia', valor: crudo, clase: 'cantidad' }]
  }
  const [, mas = '', barra = '', menos = ''] = partes
  return [
    { tipo: 'insignia', valor: mas, clase: 'agregado' },
    { tipo: 'texto', valor: barra },
    { tipo: 'insignia', valor: menos, clase: 'quitado' }
  ]
}

/** Parte el texto en trozos; pegados devuelven el texto tal cual, salvo las comillas de las citas. */
export function partirEnInsignias(texto: string): Trozo[] {
  const trozos: Trozo[] = []
  let desde = 0
  for (const encontrado of texto.matchAll(BUSCADOR)) {
    const indice = encontrado.index ?? 0
    const patron = PATRONES[encontrado.slice(1).findIndex((grupo) => grupo !== undefined)]
    if (!patron) {
      continue
    }
    if (indice > desde) {
      trozos.push({ tipo: 'texto', valor: texto.slice(desde, indice) })
    }
    const crudo = encontrado[0]
    desde = indice + crudo.length
    if (patron.clase === 'diff') {
      trozos.push(...partirDiff(crudo))
      continue
    }
    const valor = patron.clase === 'cita' ? crudo.slice(1, -1) : crudo
    const clase = patron.clase === 'dato' ? claseDeDato(valor) : patron.clase
    trozos.push({ tipo: 'insignia', valor, clase })
  }
  if (desde < texto.length) {
    trozos.push({ tipo: 'texto', valor: texto.slice(desde) })
  }
  return compararComoDatos(trozos)
}

/**
 * En «US$ 0,29 contra 0,52» la segunda cifra no trae unidad, pero es el otro lado de la misma
 * comparación: sin insignia, la comparación se lee rengueando.
 */
function compararComoDatos(trozos: Trozo[]): Trozo[] {
  const salida: Trozo[] = []
  for (const [i, trozo] of trozos.entries()) {
    const anterior = trozos[i - 1]
    const lado =
      trozo.tipo === 'texto' && anterior?.tipo === 'insignia'
        ? trozo.valor.match(/^(\s(?:contra|vs\.?|versus|frente a|a)\s)(\d+(?:[.,]\d+)*)/)
        : null
    if (
      !lado ||
      anterior?.tipo !== 'insignia' ||
      anterior.clase === 'cita' ||
      anterior.clase === 'modelo'
    ) {
      salida.push(trozo)
      continue
    }
    const [, union = '', cifra = ''] = lado
    salida.push({ tipo: 'texto', valor: union })
    salida.push({ tipo: 'insignia', valor: cifra, clase: anterior.clase })
    const resto = trozo.valor.slice(union.length + cifra.length)
    if (resto) {
      salida.push({ tipo: 'texto', valor: resto })
    }
  }
  return salida
}
