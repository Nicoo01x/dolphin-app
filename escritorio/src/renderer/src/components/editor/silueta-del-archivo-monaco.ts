import type { IDisposable, editor } from 'monaco-editor'

/**
 * La silueta del archivo en el margen: una barra por nivel de sangría, pegada al borde.
 *
 * Al mirar el margen ves dónde anida el archivo y dónde se aplana sin leer una palabra. Es
 * información que ya estaba ahí —la sangría— y que ningún editor dibuja; el minimapa intenta algo
 * parecido renderizando el texto en miniatura, que a 2 px no se lee y cuesta pintar en cada scroll.
 *
 * Se dibuja con decoraciones de margen y no con un canvas aparte porque así scrollea, se pliega y
 * se recalcula junto con el texto, sin un segundo sistema de coordenadas que mantener sincronizado.
 */

/** Hasta qué nivel se distingue. Más allá de seis todo es "muy adentro" y la barra satura. */
const NIVEL_MAXIMO = 6

/** Cuántas líneas como mucho se recorren. Un volcado de un millón de líneas no se dibuja. */
const TOPE_DE_LINEAS = 20_000

/** El nivel de sangría de una línea, en pasos de dos espacios (un tab cuenta como uno). */
export function nivelDeSangria(linea: string, nivelMaximo = NIVEL_MAXIMO): number | null {
  if (linea.trim() === '') {
    return null
  }
  const blancos = linea.length - linea.trimStart().length
  const tabs = (linea.slice(0, blancos).match(/\t/g) ?? []).length
  const espacios = blancos - tabs
  return Math.min(nivelMaximo, tabs + Math.floor(espacios / 2))
}

export function instalarSiluetaDelArchivo(
  editorInstance: editor.IStandaloneCodeEditor
): IDisposable {
  const coleccion = editorInstance.createDecorationsCollection([])
  const descartables: IDisposable[] = []

  const pintar = (): void => {
    const model = editorInstance.getModel()
    if (!model) {
      coleccion.clear()
      return
    }
    const total = model.getLineCount()
    if (total > TOPE_DE_LINEAS) {
      coleccion.clear()
      return
    }
    const decoraciones: editor.IModelDeltaDecoration[] = []
    for (let i = 1; i <= total; i++) {
      const nivel = nivelDeSangria(model.getLineContent(i))
      if (nivel === null) {
        continue
      }
      decoraciones.push({
        range: { startLineNumber: i, startColumn: 1, endLineNumber: i, endColumn: 1 },
        options: { isWholeLine: true, linesDecorationsClassName: `dolphin-sangria n${nivel}` }
      })
    }
    coleccion.set(decoraciones)
  }

  descartables.push(editorInstance.onDidChangeModelContent(pintar))
  descartables.push(editorInstance.onDidChangeModel(pintar))
  pintar()

  return {
    dispose: () => {
      coleccion.clear()
      for (const d of descartables) {
        d.dispose()
      }
      descartables.length = 0
    }
  }
}
