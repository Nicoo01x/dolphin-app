import { useComposerDolphin } from '../../../dolphin/chat/composer-dolphin'
import { comoSeOfrece } from '../../../dolphin/chat/sugerencia-de-respuesta'

/**
 * Lo que Dolphin le suma al campo del composer de la base.
 *
 * `textoDeAyuda`: la respuesta sugerida ocupa el lugar del texto de ayuda; es lo que uno va a
 * escribir, y decir «Escribí…» abajo de un agente que te preguntó algo es decir lo que ya se sabe.
 * Tab la escribe (ver dolphin/chat). `terminalTabId`: identifica los checkpoints de código del chat.
 */
export function useCampoDolphin(borrador: string): {
  terminalTabId?: string
  textoDeAyuda: string | null
} {
  const { terminalTabId, sugerencia } = useComposerDolphin(borrador)
  const textoDeAyuda = sugerencia ? comoSeOfrece(sugerencia) : null
  return terminalTabId ? { terminalTabId, textoDeAyuda } : { textoDeAyuda }
}
