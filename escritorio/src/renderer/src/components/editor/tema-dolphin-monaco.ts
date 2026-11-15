import type { editor } from 'monaco-editor'
import {
  paletaConPersonal,
  type PaletaDeCodigo,
  type PaletaParcial,
  type TintaDeRol
} from '../../../../shared/paleta-de-codigo'
import {
  CROMO_NOCHE_CLARO,
  CROMO_NOCHE_OSCURO,
  paletaDeFabrica,
  TEMA_DE_CODIGO_ANTERIOR,
  type CromoDeCodigo,
  type TemaDeCodigo
} from '../../../../shared/tema-de-codigo'

/**
 * El tema del editor de Dolphin.
 *
 * El reparto es el que importa: **el cromo va monocromo y el código lleva el color.** Los paneles,
 * el rail, el gutter y el pie se resuelven con escalones de luz —medido en la categoría: en el
 * fold, Linear pinta algo cromático en 11 de 309 elementos y Cursor en 14 de 484, y siempre
 * adentro de glifos de ≤14 px— y el color se gasta entero adentro del archivo, que es lo que la
 * persona mira ocho horas.
 *
 * Y dentro del código, la inversión que lo hace distinto de cualquier otro tema: lo que NOMBRA
 * (función, tipo) va con color Y en negrita, y lo que ESTRUCTURA (palabra clave, operador,
 * puntuación) se apaga a gris y peso liviano. Las variables tampoco llevan color: son la mayoría
 * de las palabras, y pintarlas hace que el color deje de significar algo.
 *
 * Qué color tiene cada rol no se decide acá: sale de `shared/paleta-de-codigo`, que es lo que la
 * persona puede cambiar entero desde los ajustes.
 *
 * El negro del lienzo tiene temperatura: sesgo frío constante (B − R = +4) en todos los escalones.
 * Lo que importa no es el signo —Cursor va cálido con +8, Linear frío con +2— sino que no varíe,
 * que es lo que hace que una paleta oscura se vea sucia.
 */

export const TEMA_OSCURO = 'dolphin-oscuro'
export const TEMA_CLARO = 'dolphin-claro'

function estilo(tinta: TintaDeRol): string | undefined {
  const partes = [tinta.negrita ? 'bold' : '', tinta.cursiva ? 'italic' : ''].filter(Boolean)
  return partes.length > 0 ? partes.join(' ') : undefined
}

function regla(tokens: readonly string[], tinta: TintaDeRol): editor.ITokenThemeRule[] {
  const fontStyle = estilo(tinta)
  return tokens.map((token) => ({
    token,
    foreground: tinta.color,
    ...(fontStyle ? { fontStyle } : {})
  }))
}

/**
 * De la paleta a las reglas de Monaco.
 *
 * Un rol se mapea a varios tokens porque cada lenguaje los nombra distinto; Monaco resuelve por
 * prefijo, así que `string` también agarra `string.ts` y `string.sql`.
 */
function reglasDe(paleta: PaletaDeCodigo, textoPlano?: string): editor.ITokenThemeRule[] {
  return [
    // En Noche los nombres van en azul y el texto suelto (Markdown, texto plano) queda neutro; en el
    // de siempre son el mismo gris.
    ...regla([''], textoPlano ? { color: textoPlano } : paleta.base),
    ...regla(['identifier', 'variable', 'attribute.name'], paleta.base),
    ...regla(['comment', 'comment.doc'], paleta.comentario),
    ...regla(
      [
        'delimiter',
        'delimiter.bracket',
        'delimiter.parenthesis',
        'delimiter.square',
        'delimiter.angle',
        'delimiter.curly'
      ],
      paleta.puntuacion
    ),
    ...regla(['operator'], paleta.operador),
    ...regla(['keyword', 'keyword.flow', 'keyword.operator'], paleta.clave),
    // Monaco no tiene un token propio para «llamada a función» en todos los lenguajes; donde sí
    // lo hay es `entity.name.function`/`support.function`, y el resto cae en `type.identifier`.
    ...regla(['entity.name.function', 'support.function', 'function'], paleta.funcion),
    ...regla(['type', 'type.identifier', 'tag', 'entity.name.type'], paleta.tipo),
    ...regla(['string', 'string.escape', 'string.key'], paleta.cadena),
    ...regla(['number', 'number.hex', 'number.float'], paleta.numero),
    ...regla(['regexp'], paleta.expresionRegular),
    ...regla(['annotation', 'metatag', 'attribute.value'], paleta.anotacion),
    ...regla(['invalid'], paleta.invalido)
  ]
}

/**
 * Los colores de la interfaz de Monaco: acá sí, monocromo entero.
 *
 * `editorBracketHighlight.*` no es opcional: el arcoíris de paréntesis (oro, violeta, celeste) se
 * pinta desde el TEMA y se cuela aunque `bracketPairColorization` esté apagado en las opciones.
 * Medido: un `(` quedaba en `#ffd700` con la colorización desactivada.
 */
function coloresOscuros(paleta: PaletaDeCodigo): editor.IColors {
  const punt = `#${paleta.puntuacion.color}`
  return {
    'editor.background': '#0c0d10',
    'editor.foreground': `#${paleta.base.color}`,
    'editorCursor.foreground': '#ffffff',
    'editor.lineHighlightBackground': '#111318',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#2b2d36',
    'editor.inactiveSelectionBackground': '#1b1d23',
    'editor.selectionHighlightBackground': '#1f2128',
    'editor.wordHighlightBackground': '#1c1e24',
    'editor.wordHighlightStrongBackground': '#24262e',
    'editor.findMatchBackground': '#33363f',
    'editor.findMatchHighlightBackground': '#23262d',
    'editorLineNumber.foreground': '#4f5159',
    'editorLineNumber.activeForeground': '#ffffff',
    'editorIndentGuide.background1': '#15171c',
    'editorIndentGuide.activeBackground1': '#2a2c34',
    'editorWhitespace.foreground': '#1b1d23',
    'editorGutter.background': '#0c0d10',
    'editorGutter.modifiedBackground': '#71717c',
    'editorGutter.addedBackground': '#4f5159',
    'editorGutter.deletedBackground': '#59343a',
    'editorBracketMatch.background': '#1f2128',
    'editorBracketMatch.border': '#00000000',
    'editorBracketHighlight.foreground1': punt,
    'editorBracketHighlight.foreground2': punt,
    'editorBracketHighlight.foreground3': punt,
    'editorBracketHighlight.foreground4': punt,
    'editorBracketHighlight.foreground5': punt,
    'editorBracketHighlight.foreground6': punt,
    'editorBracketHighlight.unexpectedBracket.foreground': `#${paleta.invalido.color}`,
    'editorOverviewRuler.border': '#00000000',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#ffffff0f',
    'scrollbarSlider.hoverBackground': '#ffffff1a',
    'scrollbarSlider.activeBackground': '#ffffff26',
    'editorGhostText.foreground': '#ffffff',
    'editorWidget.background': '#1c1e24',
    'editorWidget.border': '#00000000',
    'editorSuggestWidget.background': '#1c1e24',
    'editorSuggestWidget.border': '#00000000',
    'editorSuggestWidget.selectedBackground': '#26282f',
    'editorHoverWidget.background': '#1c1e24',
    'editorHoverWidget.border': '#00000000',
    'diffEditor.insertedTextBackground': '#ffffff12',
    'diffEditor.removedTextBackground': '#00000040',
    focusBorder: '#00000000'
  }
}

function coloresClaros(paleta: PaletaDeCodigo): editor.IColors {
  const punt = `#${paleta.puntuacion.color}`
  return {
    'editor.background': '#fbfbfc',
    'editor.foreground': `#${paleta.base.color}`,
    'editorCursor.foreground': '#000000',
    'editor.lineHighlightBackground': '#f2f2f5',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#dcdce3',
    'editor.inactiveSelectionBackground': '#eaeaf0',
    'editor.selectionHighlightBackground': '#ececf1',
    'editor.wordHighlightBackground': '#eeeef2',
    'editor.wordHighlightStrongBackground': '#e6e6ec',
    'editor.findMatchBackground': '#d6d6de',
    'editor.findMatchHighlightBackground': '#e8e8ee',
    'editorLineNumber.foreground': '#b6b6be',
    'editorLineNumber.activeForeground': '#000000',
    'editorIndentGuide.background1': '#eeeef2',
    'editorIndentGuide.activeBackground1': '#d8d8e0',
    'editorWhitespace.foreground': '#e6e6ec',
    'editorGutter.background': '#fbfbfc',
    'editorGutter.modifiedBackground': '#9a9aa2',
    'editorGutter.addedBackground': '#c4c4cc',
    'editorGutter.deletedBackground': '#d8b4b0',
    'editorBracketMatch.background': '#e8e8ee',
    'editorBracketMatch.border': '#00000000',
    'editorBracketHighlight.foreground1': punt,
    'editorBracketHighlight.foreground2': punt,
    'editorBracketHighlight.foreground3': punt,
    'editorBracketHighlight.foreground4': punt,
    'editorBracketHighlight.foreground5': punt,
    'editorBracketHighlight.foreground6': punt,
    'editorBracketHighlight.unexpectedBracket.foreground': `#${paleta.invalido.color}`,
    'editorOverviewRuler.border': '#00000000',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#0000000f',
    'scrollbarSlider.hoverBackground': '#0000001a',
    'scrollbarSlider.activeBackground': '#00000026',
    'editorGhostText.foreground': '#000000',
    'editorWidget.background': '#ffffff',
    'editorWidget.border': '#00000000',
    'editorSuggestWidget.background': '#ffffff',
    'editorSuggestWidget.border': '#00000000',
    'editorSuggestWidget.selectedBackground': '#f0f0f4',
    'editorHoverWidget.background': '#ffffff',
    'editorHoverWidget.border': '#00000000',
    'diffEditor.insertedTextBackground': '#00000010',
    'diffEditor.removedTextBackground': '#00000008',
    focusBorder: '#00000000'
  }
}

/**
 * El cromo de Dolphin Noche: los mismos colores de interfaz que el de siempre (monocromo), con su
 * propio lienzo y los diffs de la referencia —fondo rojo y verde muy oscuros, con la barra en el
 * margen que pinta `tema-noche.css`—.
 */
function coloresNoche(
  paleta: PaletaDeCodigo,
  cromo: CromoDeCodigo,
  oscuro: boolean
): editor.IColors {
  const base = oscuro ? coloresOscuros(paleta) : coloresClaros(paleta)
  return {
    ...base,
    'editor.background': `#${cromo.fondo}`,
    'editorGutter.background': `#${cromo.fondo}`,
    'editor.foreground': `#${cromo.texto}`,
    'editorLineNumber.foreground': `#${cromo.numeroDeLinea}`,
    'diffEditor.insertedLineBackground': `#${cromo.agregadoFondo}`,
    'diffEditor.removedLineBackground': `#${cromo.quitadoFondo}`,
    'diffEditor.insertedTextBackground': `#${cromo.agregadoMarca}${oscuro ? '29' : '33'}`,
    'diffEditor.removedTextBackground': `#${cromo.quitadoMarca}${oscuro ? '29' : '2b'}`,
    'diffEditorGutter.insertedLineBackground': `#${cromo.agregadoFondo}`,
    'diffEditorGutter.removedLineBackground': `#${cromo.quitadoFondo}`,
    'diffEditorOverview.insertedForeground': `#${cromo.agregadoMarca}`,
    'diffEditorOverview.removedForeground': `#${cromo.quitadoMarca}`,
    'diffEditor.diagonalFill': '#00000000'
  }
}

type DefinidorDeTemas = {
  defineTheme: (nombre: string, tema: editor.IStandaloneThemeData) => void
}

/**
 * Registra los dos temas con la paleta que corresponda.
 *
 * Se puede volver a llamar cuantas veces haga falta: `defineTheme` pisa la definición anterior con
 * el mismo nombre, y Monaco repinta los editores abiertos. Eso es lo que hace que cambiar un color
 * en los ajustes se vea al instante, sin reabrir nada.
 */
export function definirTemasDeDolphin(
  monacoEditor: DefinidorDeTemas,
  personal?: { oscura?: PaletaParcial; clara?: PaletaParcial },
  tema: TemaDeCodigo = TEMA_DE_CODIGO_ANTERIOR
): void {
  // Lo que la persona cambió se aplica sobre la paleta de fábrica del tema elegido: el mismo
  // «quiero las cadenas más claras» vale en los dos temas.
  const oscura = paletaConPersonal(paletaDeFabrica(tema, true), personal?.oscura)
  const clara = paletaConPersonal(paletaDeFabrica(tema, false), personal?.clara)
  const noche = tema === 'noche'
  monacoEditor.defineTheme(TEMA_OSCURO, {
    base: 'vs-dark',
    inherit: false,
    rules: reglasDe(oscura, noche ? CROMO_NOCHE_OSCURO.texto : undefined),
    colors: noche ? coloresNoche(oscura, CROMO_NOCHE_OSCURO, true) : coloresOscuros(oscura)
  })
  monacoEditor.defineTheme(TEMA_CLARO, {
    base: 'vs',
    inherit: false,
    rules: reglasDe(clara, noche ? CROMO_NOCHE_CLARO.texto : undefined),
    colors: noche ? coloresNoche(clara, CROMO_NOCHE_CLARO, false) : coloresClaros(clara)
  })
}

/** Cuál va, según el tema del sistema. */
export function temaDeDolphin(oscuro: boolean): string {
  return oscuro ? TEMA_OSCURO : TEMA_CLARO
}

/**
 * Las opciones que hacen que la idea exista.
 *
 * El peso base 300 no es un gusto: es la mitad de abajo del contraste. Monaco sólo sabe de
 * `normal` y `bold` por token, así que el salto lo da la fuente y por eso la familia tiene que
 * tener los dos pesos de verdad (JetBrains Mono los tiene; Consolas no, y ahí la idea se cae a un
 * salto de 400 a 700, que se nota menos pero sigue funcionando).
 */
export const OPCIONES_DE_TIPOGRAFIA = {
  fontWeight: '300',
  fontLigatures: true,
  letterSpacing: 0.35
} as const

/** Lo que se apaga porque no dice nada, y lo que se prende porque sí. */
export const OPCIONES_DE_CROMO = {
  bracketPairColorization: { enabled: false },
  renderLineHighlight: 'all',
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  cursorWidth: 2,
  smoothScrolling: true,
  guides: { indentation: true, bracketPairs: false }
} as const
