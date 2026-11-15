/**
 * `.editorconfig`: la sangría la decide el proyecto, no el editor.
 *
 * Hasta ahora el editor abría todo con `tabSize: 2` escrito a mano. En un repo de Go, de Python o
 * en cualquiera que use tabs, eso significa que la primera línea que escribís ya está mal
 * indentada y el formateador del proyecto te la cambia en el commit siguiente. El archivo que
 * contesta esa pregunta está en casi todos los repos y es un estándar: alcanza con leerlo.
 *
 * Acá vive sólo lo que no toca el disco —parsear, resolver globs y combinar— para poder probarlo
 * sin montar un árbol de archivos. Quién lee los archivos y en qué orden vive en el proceso
 * principal (`main/editorconfig/`).
 *
 * Qué se soporta del estándar: `root`, secciones con glob (`*`, `**`, `?`, `{a,b}`, `[abc]`,
 * `[!abc]`), y las propiedades que el editor puede obedecer de verdad: `indent_style`,
 * `indent_size`, `tab_width`, `end_of_line`, `insert_final_newline`,
 * `trim_trailing_whitespace` y `max_line_length`. Lo que no se soporta —`{1..9}`, `charset`— se
 * ignora en silencio, que es lo que pide el estándar para lo desconocido.
 */

export type EstiloDeSangria = 'tab' | 'space'

export type AjustesDelProyecto = {
  readonly estiloDeSangria?: EstiloDeSangria
  /** Cuántas columnas ocupa un nivel. Con `indent_size = tab` vale lo que diga `tab_width`. */
  readonly tamanoDeSangria?: number
  readonly anchoDeTab?: number
  readonly finDeLinea?: 'lf' | 'crlf' | 'cr'
  readonly lineaFinal?: boolean
  readonly sinEspaciosAlFinal?: boolean
  /** Dónde dibujar la regla. `off` en el archivo se lee como «ninguna». */
  readonly largoMaximo?: number
}

/** Una sección del archivo: su glob y lo que declara. */
export type SeccionDeEditorconfig = {
  readonly glob: string
  readonly propiedades: Readonly<Record<string, string>>
}

export type ArchivoEditorconfig = {
  readonly root: boolean
  readonly secciones: readonly SeccionDeEditorconfig[]
}

/**
 * Parsea un `.editorconfig`.
 *
 * Tolerante a propósito: una línea rota no tira el archivo entero. Un `.editorconfig` mal escrito
 * es mucho más común que uno ausente, y perder la sangría de todo un repo por una línea de más es
 * peor que ignorarla.
 */
export function parsearEditorconfig(texto: string): ArchivoEditorconfig {
  let root = false
  const secciones: SeccionDeEditorconfig[] = []
  let actual: { glob: string; propiedades: Record<string, string> } | null = null

  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim()
    if (linea === '' || linea.startsWith('#') || linea.startsWith(';')) {
      continue
    }
    if (linea.startsWith('[') && linea.endsWith(']')) {
      actual = { glob: linea.slice(1, -1), propiedades: {} }
      secciones.push(actual)
      continue
    }
    const corte = linea.indexOf('=')
    if (corte <= 0) {
      continue
    }
    const clave = linea.slice(0, corte).trim().toLowerCase()
    const valor = linea.slice(corte + 1).trim()
    if (actual) {
      actual.propiedades[clave] = valor
    } else if (clave === 'root') {
      root = valor.toLowerCase() === 'true'
    }
  }
  return { root, secciones }
}

/**
 * El glob de una sección, a expresión regular.
 *
 * Las reglas del estándar que importan: `*` no cruza carpetas y `**` sí; un glob sin `/` matchea
 * en cualquier carpeta (`*.ts` vale para `src/a/b.ts`), y uno con `/` se ancla a la carpeta del
 * `.editorconfig`.
 */
export function globAExpresion(glob: string): RegExp {
  const anclado = glob.includes('/')
  const limpio = anclado && glob.startsWith('/') ? glob.slice(1) : glob
  let salida = ''
  let i = 0
  while (i < limpio.length) {
    const c = limpio[i]
    if (c === '*') {
      if (limpio[i + 1] === '*') {
        salida += '.*'
        i += 2
        // `**/` también matchea cero carpetas: `**/a.ts` vale para `a.ts`.
        if (limpio[i] === '/') {
          salida += '(?:)'
          i += 1
        }
        continue
      }
      salida += '[^/]*'
      i += 1
      continue
    }
    if (c === '?') {
      salida += '[^/]'
      i += 1
      continue
    }
    if (c === '[') {
      const cierre = limpio.indexOf(']', i + 1)
      if (cierre > 0) {
        const adentro = limpio.slice(i + 1, cierre)
        salida += `[${adentro.startsWith('!') ? `^${escapar(adentro.slice(1))}` : escapar(adentro)}]`
        i = cierre + 1
        continue
      }
    }
    if (c === '{') {
      const cierre = limpio.indexOf('}', i + 1)
      if (cierre > 0) {
        const partes = limpio.slice(i + 1, cierre).split(',')
        salida += `(?:${partes.map((p) => globAExpresion(p).source.replace(/^\^|\$$/g, '')).join('|')})`
        i = cierre + 1
        continue
      }
    }
    salida += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    i += 1
  }
  // Sin `/` el glob flota: puede empezar en cualquier carpeta.
  return new RegExp(`^${anclado ? '' : '(?:.*/)?'}${salida}$`)
}

function escapar(texto: string): string {
  return texto.replace(/[\\\]^-]/g, '\\$&')
}

/** Si esa ruta relativa (con `/`, siempre) cae bajo ese glob. */
export function elGlobAgarra(glob: string, rutaRelativa: string): boolean {
  try {
    return globAExpresion(glob).test(rutaRelativa)
  } catch {
    // Un glob que no compila es un archivo mal escrito, no un motivo para romper el editor.
    return false
  }
}

const SI = new Set(['true', 'yes', 'on', '1'])
const NO = new Set(['false', 'no', 'off', '0'])

function numero(valor: string | undefined): number | undefined {
  if (valor === undefined) {
    return undefined
  }
  const n = Number.parseInt(valor, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function booleano(valor: string | undefined): boolean | undefined {
  if (valor === undefined) {
    return undefined
  }
  const v = valor.toLowerCase()
  return SI.has(v) ? true : NO.has(v) ? false : undefined
}

/**
 * Resuelve los ajustes para un archivo.
 *
 * `archivos` viene del más LEJANO al más cercano, que es el orden en que se aplican: lo de abajo
 * pisa lo de arriba, y adentro de cada archivo la última sección que agarra pisa a las anteriores.
 * Es lo que dice el estándar, y es lo que hace que un `[*.md]` al final del archivo de la raíz le
 * gane al `[*]` del principio.
 */
export function ajustesParaElArchivo(
  archivos: readonly { readonly contenido: ArchivoEditorconfig; readonly rutaRelativa: string }[]
): AjustesDelProyecto {
  const crudo: Record<string, string> = {}
  for (const { contenido, rutaRelativa } of archivos) {
    for (const seccion of contenido.secciones) {
      if (elGlobAgarra(seccion.glob, rutaRelativa)) {
        Object.assign(crudo, seccion.propiedades)
      }
    }
  }

  const estilo = crudo.indent_style?.toLowerCase()
  const anchoDeTab = numero(crudo.tab_width)
  // `indent_size = tab` significa «lo que mida un tab», que es la otra propiedad.
  const tamano = crudo.indent_size?.toLowerCase() === 'tab' ? anchoDeTab : numero(crudo.indent_size)
  const finDeLinea = crudo.end_of_line?.toLowerCase()
  // `max_line_length = off` es válido y quiere decir que no hay regla.
  const largo =
    crudo.max_line_length?.toLowerCase() === 'off' ? undefined : numero(crudo.max_line_length)

  return {
    ...(estilo === 'tab' || estilo === 'space' ? { estiloDeSangria: estilo } : {}),
    ...(tamano !== undefined ? { tamanoDeSangria: tamano } : {}),
    ...(anchoDeTab !== undefined ? { anchoDeTab } : {}),
    ...(finDeLinea === 'lf' || finDeLinea === 'crlf' || finDeLinea === 'cr' ? { finDeLinea } : {}),
    ...(booleano(crudo.insert_final_newline) !== undefined
      ? { lineaFinal: booleano(crudo.insert_final_newline) }
      : {}),
    ...(booleano(crudo.trim_trailing_whitespace) !== undefined
      ? { sinEspaciosAlFinal: booleano(crudo.trim_trailing_whitespace) }
      : {}),
    ...(largo !== undefined ? { largoMaximo: largo } : {})
  }
}

/**
 * Lo que de esto entiende Monaco.
 *
 * Se devuelve `undefined` cuando el proyecto no dijo nada, para que el editor use lo suyo en vez
 * de un valor inventado acá: un default escondido en dos lugares es peor que ninguno.
 */
export function opcionesDeMonaco(ajustes: AjustesDelProyecto): {
  tabSize?: number
  insertSpaces?: boolean
  rulers?: number[]
  trimAutoWhitespace?: boolean
} {
  const tabSize = ajustes.tamanoDeSangria ?? ajustes.anchoDeTab
  return {
    ...(tabSize !== undefined ? { tabSize } : {}),
    ...(ajustes.estiloDeSangria !== undefined
      ? { insertSpaces: ajustes.estiloDeSangria === 'space' }
      : {}),
    ...(ajustes.largoMaximo !== undefined ? { rulers: [ajustes.largoMaximo] } : {}),
    ...(ajustes.sinEspaciosAlFinal !== undefined
      ? { trimAutoWhitespace: ajustes.sinEspaciosAlFinal }
      : {})
  }
}
