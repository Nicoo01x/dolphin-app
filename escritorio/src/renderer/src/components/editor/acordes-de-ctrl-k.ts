/**
 * Los atajos de dos teclas de Monaco que empiezan con Ctrl+K (Cmd+K en macOS).
 *
 * La edición en el lugar se abre con Ctrl+K sola y al instante. Monaco, con una tecla simple
 * registrada en Ctrl+K, deja de entrar en modo acorde: sin esto, Ctrl+K Ctrl+C (comentar),
 * Ctrl+K Ctrl+0 (plegar todo) y el resto dejaban de andar. La salida es la de un acorde: si la
 * tecla que sigue a Ctrl+K completa uno de estos, el cuadrito se cierra y corre la acción de
 * Monaco, como si nunca se hubiera abierto.
 *
 * Es una tabla y no una consulta al servicio de atajos de Monaco porque ese servicio no es parte
 * de su API pública. La tabla sale de Monaco 0.55 (`KeyChord(CtrlCmd|KeyK, …)` en
 * `editor/contrib`); si una versión nueva agrega un acorde, lo que pasa es que ese acorde no
 * corre después de Ctrl+K, no que algo se rompa. Quedan afuera a propósito:
 * - Ctrl+K Ctrl+K, que es «seleccionar desde el ancla» y necesita un ancla puesta: apretar
 *   Ctrl+K dos veces sin querer no tiene que cerrar el cuadrito;
 * - Ctrl+K F12, «abrir la definición al costado», que en Monaco suelto no tiene costado.
 */
const SEGUNDA_TECLA: Readonly<Record<string, string>> = {
  'Mod+KeyC': 'editor.action.addCommentLine',
  'Mod+KeyU': 'editor.action.removeCommentLine',
  'Mod+KeyF': 'editor.action.formatSelection',
  'Mod+KeyX': 'editor.action.trimTrailingWhitespace',
  'Mod+KeyD': 'editor.action.moveSelectionToNextFindMatch',
  'Mod+KeyB': 'editor.action.setSelectionAnchor',
  'Mod+KeyI': 'editor.action.showHover',
  'Mod+KeyL': 'editor.toggleFold',
  'Mod+Shift+KeyL': 'editor.toggleFoldRecursively',
  'Mod+BracketLeft': 'editor.foldRecursively',
  'Mod+BracketRight': 'editor.unfoldRecursively',
  'Mod+Slash': 'editor.foldAllBlockComments',
  'Mod+Minus': 'editor.foldAllExcept',
  'Mod+Equal': 'editor.unfoldAllExcept',
  'Mod+Comma': 'editor.createFoldingRangeFromSelection',
  'Mod+Period': 'editor.removeManualFoldingRanges',
  'Mod+Digit0': 'editor.foldAll',
  'Mod+KeyJ': 'editor.unfoldAll',
  'Mod+Digit8': 'editor.foldAllMarkerRegions',
  'Mod+Digit9': 'editor.unfoldAllMarkerRegions',
  'Mod+Digit1': 'editor.foldLevel1',
  'Mod+Digit2': 'editor.foldLevel2',
  'Mod+Digit3': 'editor.foldLevel3',
  'Mod+Digit4': 'editor.foldLevel4',
  'Mod+Digit5': 'editor.foldLevel5',
  'Mod+Digit6': 'editor.foldLevel6',
  'Mod+Digit7': 'editor.foldLevel7'
}

export type TeclaApretada = Pick<
  KeyboardEvent,
  'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'
>

const MODIFICADORES = new Set([
  'ControlLeft',
  'ControlRight',
  'MetaLeft',
  'MetaRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'OSLeft',
  'OSRight'
])

/** Si la tecla es sólo un modificador (la persona sigue apretando Ctrl), todavía no decidió. */
export function esSoloModificador(tecla: Pick<KeyboardEvent, 'code'>): boolean {
  return MODIFICADORES.has(tecla.code)
}

/**
 * La acción de Monaco que completa Ctrl+K + esta tecla, o null si no completa ninguna. Se mira
 * `code` (la tecla física) y no `key`: los acordes de Monaco son posiciones del teclado.
 */
export function accionDelAcorde(tecla: TeclaApretada, esMac: boolean): string | null {
  const principal = esMac ? tecla.metaKey : tecla.ctrlKey
  const otro = esMac ? tecla.ctrlKey : tecla.metaKey
  if (!principal || otro || tecla.altKey) {
    return null
  }
  const nombre = `Mod+${tecla.shiftKey ? 'Shift+' : ''}${tecla.code}`
  return SEGUNDA_TECLA[nombre] ?? null
}
