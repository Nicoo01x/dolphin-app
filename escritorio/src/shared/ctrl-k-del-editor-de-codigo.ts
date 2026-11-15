import { getKeybindingDefinition } from './keybindings/definitions'
import { getDefaultBindings } from './keybindings/effective'
import type { KeybindingActionId, KeybindingOverrides } from './keybindings/types'
import {
  getWindowShortcutActionId,
  resolveWindowShortcutAction,
  type WindowShortcutInput
} from './window-shortcut-policy'

/**
 * ¿Le toca a Monaco este Cmd/Ctrl+K, aunque el proceso principal tenga un atajo global en esa tecla?
 *
 * Con el foco en el editor de código, Cmd/Ctrl+K es la edición en el lugar de Dolphin. Desde la
 * versión de la base del 11/11 «Switch worktree» viene en Mod+K para los perfiles nuevos, y el proceso
 * principal se queda con la tecla en `before-input-event`, antes de que llegue a Monaco.
 *
 * Sólo cede lo que viene de fábrica: si la persona puso a mano una acción global en Mod+K desde
 * Ajustes, esa elección manda también adentro del editor. Poner la paleta sola en Mod+K es lo
 * mismo que lo de fábrica (el archivo no distingue eso de un «Restablecer»), así que cuenta como
 * tal. La cohorte vieja tiene la paleta en
 * Mod+Shift+J, así que ahí no hay nada que resolver y esta función contesta `false` sin cambiar nada.
 */
export function editorDeCodigoReclamaCtrlK(args: {
  input: WindowShortcutInput
  platform: NodeJS.Platform
  keybindings: KeybindingOverrides | undefined
  editorEnfocado: boolean
}): boolean {
  const { input, platform, keybindings, editorEnfocado } = args
  if (!editorEnfocado || !esCtrlKPelado(input, platform)) {
    return false
  }
  const accion = resolveWindowShortcutAction(input, platform, keybindings, { context: 'app' })
  if (!accion) {
    return false
  }
  const idDeLaAccion = getWindowShortcutActionId(accion)
  if (idDeLaAccion === null) {
    return true
  }
  // Una acción con override es una elección de la persona (o de su cohorte): no se le discute.
  // Salvo que el override sea el atajo de fábrica: «Restablecer» de la base lo escribe así a propósito
  // para las acciones que cambiaron de tecla entre cohortes (`getKeybindingResetBindings`), y ahí
  // el archivo dice Mod+K aunque la persona haya pedido volver a lo de fábrica.
  const propio = keybindings?.[idDeLaAccion]
  return propio === undefined || esElDeFabrica(idDeLaAccion, propio, platform)
}

function esElDeFabrica(
  idDeLaAccion: KeybindingActionId,
  atajos: readonly string[],
  platform: NodeJS.Platform
): boolean {
  const definicion = getKeybindingDefinition(idDeLaAccion)
  if (!definicion) {
    return false
  }
  const deFabrica = getDefaultBindings(definicion, platform)
  return atajos.length === deFabrica.length && atajos.every((atajo) => deFabrica.includes(atajo))
}

/** Cmd+K en macOS, Ctrl+K en el resto, sin ningún otro modificador. */
function esCtrlKPelado(input: WindowShortcutInput, platform: NodeJS.Platform): boolean {
  const control = Boolean(input.control ?? input.ctrlKey)
  const meta = Boolean(input.meta ?? input.metaKey)
  const alt = Boolean(input.alt ?? input.altKey)
  const shift = Boolean(input.shift ?? input.shiftKey)
  const principal = platform === 'darwin' ? meta : control
  const otro = platform === 'darwin' ? control : meta
  return principal && !otro && !alt && !shift && (input.key ?? '').toLowerCase() === 'k'
}
