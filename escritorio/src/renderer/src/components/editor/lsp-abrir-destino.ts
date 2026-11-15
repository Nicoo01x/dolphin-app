import type * as monacoEditor from 'monaco-editor'
import type { IDisposable, IPosition, IRange, Uri } from 'monaco-editor'
import { rutaDeUri } from '../../../../shared/lsp/a-monaco'

type MonacoApi = typeof monacoEditor

/**
 * Abre un archivo en una pestaña y deja el cursor en ese lugar. Devuelve si pudo: un archivo fuera
 * del worktree, por ejemplo, no se abre desde acá.
 */
export type AbrirUbicacion = (ruta: string, linea: number, columna: number) => boolean

/**
 * «Ir a la definición» hacia OTRO archivo.
 *
 * Monaco suelto sólo sabe saltar adentro del modelo que el editor ya tiene; para cualquier otro
 * destino pregunta a los «openers» registrados y, si nadie contesta, no hace nada. Este es el
 * nuestro: traduce el destino a una ruta y le pide a la app que abra la pestaña.
 *
 * `rutaDelModelo` resuelve los uris de modelos abiertos (el esquema propio de la base, que no es
 * `file:`); `abridorDe` da la forma de abrir archivos del worktree del editor de origen.
 */
export function instalarAbridorDeDestinos(args: {
  readonly monaco: MonacoApi
  readonly rutaDelModelo: (uriDelModelo: string) => string | undefined
  readonly abridorDe: (idDelEditor: string) => AbrirUbicacion | undefined
}): IDisposable {
  return args.monaco.editor.registerEditorOpener({
    openCodeEditor: (fuente, recurso: Uri, seleccion?: IRange | IPosition) => {
      // El mismo modelo lo resuelve Monaco solo, y mejor: no cambia de pestaña.
      if (fuente.getModel()?.uri.toString() === recurso.toString()) {
        return false
      }
      const ruta =
        args.rutaDelModelo(recurso.toString()) ??
        (recurso.scheme === 'file' ? rutaDeUri(recurso.toString()) : undefined)
      const abrir = args.abridorDe(fuente.getId())
      if (!ruta || !abrir) {
        return false
      }
      const { linea, columna } = lugarDe(seleccion)
      return abrir(ruta, linea, columna)
    }
  })
}

export function lugarDe(seleccion: IRange | IPosition | undefined): {
  linea: number
  columna: number
} {
  if (!seleccion) {
    return { linea: 1, columna: 1 }
  }
  return 'startLineNumber' in seleccion
    ? { linea: seleccion.startLineNumber, columna: seleccion.startColumn }
    : { linea: seleccion.lineNumber, columna: seleccion.column }
}
