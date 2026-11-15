import { useEffect } from 'react'
import type { editor } from 'monaco-editor'
import { opcionesDeMonaco } from '../../../../shared/editorconfig'

/**
 * Que el editor abra cada archivo con la sangría que pide el proyecto.
 *
 * Hasta ahora todo abría con `tabSize: 2` escrito a mano. En un repo de Go, de Python o en
 * cualquiera que use tabs, eso significa que la primera línea que escribís ya está mal indentada
 * y el formateador te la cambia en el commit siguiente. El `.editorconfig` contesta esa pregunta
 * y está en casi todos los repos.
 *
 * Se aplica al MODELO y no al editor: la sangría es del archivo, no de la ventana. Dos pestañas
 * con dos archivos de carpetas distintas pueden tener sangrías distintas, y con `updateOptions`
 * del editor la segunda le pisaba la suya a la primera.
 *
 * Lo que el proyecto no declara no se toca: `opcionesDeMonaco` devuelve sólo las claves que
 * existen de verdad, así el default sigue viviendo en un único lugar.
 */
export function useAjustesDelProyecto(args: {
  editor: editor.IStandaloneCodeEditor | null
  rutaDelArchivo: string
  worktreePath: string | null
}): void {
  const { editor: instancia, rutaDelArchivo, worktreePath } = args

  useEffect(() => {
    if (!instancia || !worktreePath) {
      return
    }
    let vigente = true
    void window.api.editor
      .resolveEditorConfig({ worktreePath, filePath: rutaDelArchivo })
      .then((ajustes) => {
        // El archivo pudo cambiar mientras se leía el disco; aplicar lo de otro archivo sería
        // peor que no aplicar nada.
        if (!vigente) {
          return
        }
        const opciones = opcionesDeMonaco(ajustes)
        if (Object.keys(opciones).length === 0) {
          return
        }
        const { rulers, trimAutoWhitespace, ...delModelo } = opciones
        if (Object.keys(delModelo).length > 0) {
          instancia.getModel()?.updateOptions(delModelo)
        }
        // Estas dos sí son de la vista, no del archivo.
        if (rulers || trimAutoWhitespace !== undefined) {
          instancia.updateOptions({
            ...(rulers ? { rulers } : {}),
            ...(trimAutoWhitespace !== undefined ? { trimAutoWhitespace } : {})
          })
        }
      })
      .catch(() => {
        // Sin `.editorconfig` legible el editor usa lo suyo; no hay nada que avisar.
      })
    return () => {
      vigente = false
    }
  }, [instancia, rutaDelArchivo, worktreePath])
}
