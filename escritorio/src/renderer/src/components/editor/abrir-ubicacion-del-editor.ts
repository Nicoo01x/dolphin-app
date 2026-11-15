import { useAppStore } from '@/store'
import { scheduleEditorLineReveal } from '@/store/slices/editor/focus/editor-focus-reveal'
import { detectLanguage } from '../../../../shared/editor-language/editor-language-detect'
import { relativePathInsideRoot, resolveRuntimePath } from '../../../../shared/cross-platform-path'
import type { AbrirUbicacion } from './lsp-abrir-destino'

/**
 * Cómo abre el editor otro archivo del mismo worktree en una pestaña y deja el cursor en un lugar:
 * lo usa «ir a la definición» cuando la definición está en otro archivo.
 *
 * Es el camino de la base para abrir un link de la terminal (`terminal-file-link-editor-open`):
 * `openFileForLink` y después `scheduleEditorLineReveal` atado a la vista donde quedó, que
 * espera a que Monaco se remonte.
 *
 * Sólo archivos de adentro del worktree: abrir algo de afuera (una definición en la instalación
 * global de TypeScript, por ejemplo) necesita un permiso del host que una pestaña normal no tiene.
 */
export function crearAbrirUbicacion(worktreeId: string, worktreePath: string): AbrirUbicacion {
  return (ruta, linea, columna) => {
    const relativa = relativePathInsideRoot(worktreePath, ruta)
    if (!relativa) {
      return false
    }
    const absoluta = resolveRuntimePath(worktreePath, relativa)
    // Sin intención de link (null) abre donde abre `openFile`: en el grupo activo, el del editor
    // desde el que se pidió. Lo que suma es saber en qué VISTA quedó: con el editor dividido y el
    // archivo ya abierto en el otro panel, el mismo archivo tiene dos vistas, y un salto sólo por
    // archivo lo tomaba la que ya estaba montada (la del otro panel) mientras la pestaña nueva
    // quedaba en la línea 1. Es lo mismo que hace la base con los links de la terminal.
    useAppStore.getState().openFileForLink(
      {
        filePath: absoluta,
        relativePath: relativa,
        worktreeId,
        language: detectLanguage(relativa),
        mode: 'edit'
      },
      undefined,
      null,
      (vista) => {
        if (!vista) {
          return
        }
        scheduleEditorLineReveal(useAppStore.getState, absoluta, linea, columna, vista.fileId, {
          viewStateId: vista.viewStateId
        })
      }
    )
    return true
  }
}
