import type { IDisposable, editor } from 'monaco-editor'
import { registrarDestinoDeApply } from '@/lib/aplicar-bloque-abierto'
import { aplicarBloqueEnModelo } from './aplicar-bloque-en-monaco'

/**
 * Deja este editor disponible para el botón Apply del chat.
 *
 * Guarda cuándo la vista tuvo el foco por última vez porque con dos archivos abiertos el bloque
 * tiene que ir al que la persona estaba mirando, y no al que se montó último — al arrancar se
 * restauran todas las pestañas y el orden de montaje no dice nada.
 */
export function instalarDestinoDeApply(
  editorInstance: editor.IStandaloneCodeEditor,
  rutaDelArchivo: string
): IDisposable {
  let ultimoFoco = editorInstance.hasTextFocus() ? performance.now() : 0
  const focoSub = editorInstance.onDidFocusEditorText(() => {
    ultimoFoco = performance.now()
  })
  const olvidar = registrarDestinoDeApply({
    rutaDelArchivo,
    ultimoFoco: () => ultimoFoco,
    aplicar: (bloque) => {
      const model = editorInstance.getModel()
      return model ? aplicarBloqueEnModelo(model, bloque).estado : 'no-encontrado'
    }
  })
  return {
    dispose: () => {
      focoSub.dispose()
      olvidar()
    }
  }
}
