import { translate } from '@/i18n/i18n'
import type { OnMount } from '@monaco-editor/react'
import type { IDisposable, editor } from 'monaco-editor'
import {
  prediccionConModeloActiva,
  prediccionLocalActiva,
  type AlcanceDePrediccion
} from '../../../../shared/prediccion-de-edicion-settings'
import { CONTEXTO_DE_PREDICCION } from '../../../../shared/prediccion-con-modelo'
import { renombreDelCambio, type Renombre } from './proxima-edicion'
import { saltoDeTab } from './salto-de-tab'
import {
  instalarPrediccionConModelo,
  type PrediccionConModelo
} from './prediccion-con-modelo-monaco'

type MonacoApi = Parameters<OnMount>[1]

/**
 * El Tab predictivo, enganchado al texto fantasma que Monaco ya sabe dibujar.
 *
 * Cómo se siente: cambiás un nombre en un lado y, cuando el cursor cae sobre otro lugar que
 * todavía dice el nombre viejo, aparece el nuevo en gris. Tab lo acepta. No hay modelo atrás —se
 * deduce de la edición que acabás de hacer— así que aparece al instante y nunca inventa.
 *
 * Se usa la API de sugerencias en línea de Monaco en vez de dibujar un widget propio: ya resuelve
 * el gris, el Tab, el Escape y el no pelearse con el autocompletado normal.
 */

/**
 * Hasta qué tamaño se guarda una copia del documento para poder comparar.
 *
 * Hace falta porque el evento de cambio de Monaco trae lo que se escribió pero NO lo que se
 * borró, y sin lo borrado no hay forma de saber que hubo un renombre. Guardar una copia de un
 * archivo de código son unos kilobytes; de un volcado de un millón de líneas, no. Pasado el tope
 * la predicción se apaga sola para ese archivo, que es mejor que duplicar la memoria sin avisar.
 */
const TOPE_PARA_COMPARAR = 2 * 1024 * 1024

/**
 * La clave de contexto que decide si Tab salta.
 *
 * Tab es la tecla más cargada del editor —tabula, acepta el autocompletado, avanza un snippet—,
 * así que el salto se ata a una condición que es verdadera sólo cuando hay un lugar al que ir Y
 * ese lugar está marcado en pantalla. Robarle Tab al tabulado en silencio sería peor que no tener
 * la función: quien renombró algo y después quiere indentar una línea no espera que el cursor se
 * le vaya a otra parte.
 */
const CLAVE_DE_SALTO = 'dolphinHaySaltoDeEdicion'

type Memoria = { previo: string; renombre: Renombre | null }

export type PrediccionInstalada = IDisposable

/**
 * Instala la predicción sobre un editor. Devuelve con qué desarmarla.
 *
 * `leerAlcance` se consulta en cada uso y no una vez al instalar: apagar el ajuste tiene que
 * apagar la función en el momento, sin reabrir el archivo.
 */
export function instalarPrediccionDeEdicion(args: {
  monaco: MonacoApi
  editor: editor.IStandaloneCodeEditor
  leerAlcance: () => AlcanceDePrediccion | undefined
  /** Sólo para el escalón `con-modelo`; sin esto la predicción es la local de siempre. */
  rutaDelArchivo?: string
  leerWorktreePath?: () => string | null
}): PrediccionInstalada {
  const { monaco, editor: editorInstance, leerAlcance } = args
  const memorias = new WeakMap<editor.ITextModel, Memoria>()
  const descartables: IDisposable[] = []

  const activa = (): boolean => prediccionLocalActiva(leerAlcance())
  const conModelo = (): boolean => prediccionConModeloActiva(leerAlcance())

  // El escalón de arriba. Se instala sólo si hay dónde correr un agente: sin worktree el pedido
  // se rechaza igual, y montar el reloj de consulta para nada es gastar batería en nada.
  let delModelo: PrediccionConModelo | null = null
  if (args.rutaDelArchivo && args.leerWorktreePath) {
    delModelo = instalarPrediccionConModelo({
      editor: editorInstance,
      rutaDelArchivo: args.rutaDelArchivo,
      leerWorktreePath: args.leerWorktreePath,
      activa: conModelo
    })
    descartables.push(delModelo)
    // Cuando el modelo contesta, el fantasma no aparece solo: hay que pedirle a Monaco que
    // vuelva a preguntar. Sin esto la sugerencia queda guardada y no la ve nadie hasta la
    // próxima tecla.
    descartables.push(
      delModelo.alLlegar(() => {
        editorInstance.trigger('dolphin', 'editor.action.inlineSuggest.trigger', {})
      })
    )
  }

  const recordar = (model: editor.ITextModel): void => {
    const texto = model.getValue()
    if (texto.length > TOPE_PARA_COMPARAR) {
      memorias.delete(model)
      return
    }
    const memoria = memorias.get(model)
    memorias.set(model, { previo: texto, renombre: memoria?.renombre ?? null })
  }

  const alCambiar = (evento: editor.IModelContentChangedEvent): void => {
    const model = editorInstance.getModel()
    if (!model || !activa()) {
      return
    }
    const memoria = memorias.get(model)
    if (!memoria) {
      recordar(model)
      return
    }
    // Un solo cambio: un renombre es una sustitución, no una tanda. Con varias a la vez (un
    // reemplazar todo, un pegado grande) no hay una intención que deducir.
    const cambio = evento.changes.length === 1 ? evento.changes[0] : undefined
    const renombre = cambio
      ? renombreDelCambio(
          {
            desde: cambio.rangeOffset,
            quitado: memoria.previo.slice(
              cambio.rangeOffset,
              cambio.rangeOffset + cambio.rangeLength
            ),
            puesto: cambio.text
          },
          memoria.previo
        )
      : null
    const texto = model.getValue()
    memorias.set(model, {
      previo: texto.length > TOPE_PARA_COMPARAR ? '' : texto,
      // Un cambio que no es un renombre no borra el anterior: se sigue ofreciendo mientras la
      // persona recorre el archivo tocando otras cosas.
      renombre: renombre ?? memoria.renombre
    })
  }

  // El lugar al que Tab va a llevar, marcado en pantalla, y la condición que habilita la tecla.
  const marca = editorInstance.createDecorationsCollection([])
  const haySalto = editorInstance.createContextKey<boolean>(CLAVE_DE_SALTO, false)

  const repintarLaMarca = (): void => {
    const model = editorInstance.getModel()
    const renombre = activa() ? memorias.get(model as editor.ITextModel)?.renombre : null
    const posicion = editorInstance.getPosition()
    // Con un renombre pendiente esto recorre el documento en cada movimiento del cursor; sin uno
    // no hace nada, que es la situación normal. Por eso la guardia va primero y no después.
    if (!model || !renombre || !posicion) {
      marca.clear()
      haySalto.set(false)
      return
    }
    const sitio = saltoDeTab(model.getValue(), renombre, model.getOffsetAt(posicion))
    if (!sitio) {
      marca.clear()
      haySalto.set(false)
      return
    }
    const desde = model.getPositionAt(sitio.desde)
    const hasta = model.getPositionAt(sitio.hasta)
    marca.set([
      {
        range: {
          startLineNumber: desde.lineNumber,
          startColumn: desde.column,
          endLineNumber: hasta.lineNumber,
          endColumn: hasta.column
        },
        options: {
          inlineClassName: 'dolphin-proxima-edicion',
          // El cartelito es lo que hace que Tab no sea una sorpresa: dice qué tecla y dónde.
          after: { content: ' Tab ', inlineClassName: 'dolphin-proxima-edicion-tecla' }
        }
      }
    ])
    haySalto.set(true)
  }

  descartables.push(
    editorInstance.onDidChangeModelContent((evento) => {
      alCambiar(evento)
      repintarLaMarca()
    })
  )
  descartables.push(editorInstance.onDidChangeCursorPosition(repintarLaMarca))
  descartables.push(
    editorInstance.onDidChangeModel(() => {
      const model = editorInstance.getModel()
      if (model) {
        recordar(model)
      }
      repintarLaMarca()
    })
  )
  const inicial = editorInstance.getModel()
  if (inicial) {
    recordar(inicial)
  }

  descartables.push(
    editorInstance.addAction({
      id: 'dolphin.saltarALaProximaEdicion',
      label: translate('editor.jumpToNextPendingEdit', 'Jump to the next pending edit'),
      keybindings: [monaco.KeyCode.Tab],
      // Los otros dos dueños de Tab se respetan por nombre: con el autocompletado abierto o
      // adentro de un snippet, Tab sigue siendo de ellos.
      precondition: `${CLAVE_DE_SALTO} && !suggestWidgetVisible && !inSnippetMode`,
      run: (instancia) => {
        const model = instancia.getModel()
        const renombre = activa() ? memorias.get(model as editor.ITextModel)?.renombre : null
        const posicion = instancia.getPosition()
        if (!model || !renombre || !posicion) {
          return
        }
        const sitio = saltoDeTab(model.getValue(), renombre, model.getOffsetAt(posicion))
        if (!sitio) {
          return
        }
        // Al arranque del nombre, no al final: ahí la sugerencia en gris se dibuja sobre el
        // nombre entero y el próximo Tab lo reemplaza completo.
        const destino = model.getPositionAt(sitio.desde)
        instancia.setPosition(destino)
        instancia.revealPositionInCenterIfOutsideViewport(destino)
        repintarLaMarca()
      }
    })
  )

  descartables.push(
    monaco.languages.registerInlineCompletionsProvider(
      { pattern: '**' },
      {
        provideInlineCompletions: (model, position) => {
          // El camino local primero, siempre: es instantáneo, es gratis y nunca inventa. Al
          // modelo se le pregunta sólo por lo que éste no puede deducir.
          const renombre = activa() ? memorias.get(model)?.renombre : null
          const palabra = renombre ? model.getWordAtPosition(position) : null
          if (renombre && palabra && palabra.word === renombre.viejo) {
            return {
              items: [
                {
                  insertText: renombre.nuevo,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: palabra.startColumn,
                    endLineNumber: position.lineNumber,
                    endColumn: palabra.endColumn
                  }
                }
              ]
            }
          }
          if (!delModelo || !conModelo()) {
            return { items: [] }
          }
          const hasta = model.getOffsetAt(position)
          const prefijo = model.getValue().slice(Math.max(0, hasta - CONTEXTO_DE_PREDICCION), hasta)
          const sugerencia = delModelo.sugerenciaPara(prefijo)
          // Se inserta en el cursor y no reemplaza nada: lo que el modelo propone es lo que
          // sigue, no una corrección de lo que ya está escrito.
          return sugerencia ? { items: [{ insertText: sugerencia }] } : { items: [] }
        },
        // Se llama `disposeInlineCompletions` y es OBLIGATORIO en esta versión de Monaco. Estaba
        // escrito `freeInlineCompletions`, que es el nombre viejo y que acá no existe: Monaco
        // llamaba a una función que no estaba y reventaba al descartar las sugerencias
        // («this.provider.disposeInlineCompletions is not a function»), una promesa rechazada sin
        // atrapar adentro del renderer cada vez que la sugerencia se iba de pantalla.
        disposeInlineCompletions: () => {
          // No se guarda nada por sugerencia: no hay qué liberar.
        }
      }
    )
  )

  return {
    dispose: () => {
      marca.clear()
      haySalto.set(false)
      for (const descartable of descartables) {
        descartable.dispose()
      }
      descartables.length = 0
    }
  }
}
