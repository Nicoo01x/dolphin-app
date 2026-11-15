import { translate } from '@/i18n/i18n'
import type { OnMount } from '@monaco-editor/react'
import type { IDisposable, editor } from 'monaco-editor'
import { crearCuadrito, type Cuadrito } from './edicion-en-el-lugar-cuadrito'
import { aplicarEdicionEnElLugar, pedidoDeEdicion, type Tramo } from './edicion-en-el-lugar'
import { accionDelAcorde, esSoloModificador } from './acordes-de-ctrl-k'
import { avisoDeFocoDelEditor } from './aviso-de-foco-del-editor'
import {
  EDICION_CERRADA,
  pasoDeEdicion,
  type EstadoEdicion,
  type SucesoEdicion
} from './edicion-en-el-lugar-estado'

type MonacoApi = Parameters<OnMount>[1]

/**
 * Cmd+K: pedirle a la IA que reescriba lo que tenés seleccionado, adentro del editor.
 *
 * Las tres decisiones que importan, porque son las que se rompen solas:
 *
 * - **La revisión del documento manda.** Cada pedido se marca con la versión del modelo de Monaco
 *   y una respuesta de otra versión se tira. El tramo se midió en el documento de antes; aplicarlo
 *   «donde más o menos iba» escribe en el lugar equivocado de un archivo de la persona.
 * - **Nada se escribe sin que alguien lo mire.** Lo que contesta el modelo se muestra y recién se
 *   aplica al aceptar. El botón dice Accept porque eso es lo que hace.
 * - **Se aplica como UNA edición del editor**, no reemplazando el documento: así Ctrl+Z la
 *   deshace igual que si la hubieras tipeado, y el resto del archivo no se toca.
 *
 * El estado y sus reglas viven en `edicion-en-el-lugar-estado`, probados sin editor. Acá queda
 * sólo el cableado: el widget, la tecla y la llamada.
 */

/** Cuánto contexto de cada lado se le manda al modelo. Dos pantallas alcanzan para entender. */
const CONTEXTO = 2000

const ES_MAC = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

export function instalarEdicionEnElLugar(args: {
  monaco: MonacoApi
  editor: editor.IStandaloneCodeEditor
  rutaDelArchivo: string
  /** De dónde sale el worktree del pedido; null cuando el archivo no cuelga de ninguno. */
  leerWorktreePath: () => string | null
}): IDisposable {
  const { monaco, editor: editorInstance, rutaDelArchivo, leerWorktreePath } = args
  const descartables: IDisposable[] = []
  let estado: EstadoEdicion = EDICION_CERRADA
  let cuadrito: Cuadrito | null = null
  let widget: editor.IContentWidget | null = null
  let visible = false
  // Entre Ctrl+K y la tecla siguiente: si esa tecla completa un acorde de Monaco, gana el acorde.
  let esperandoSegundaTecla = false
  // El cuadrito se abrió pero el foco todavía no pudo entrar (ver `enfocarElCuadrito`).
  let focoPendiente = false

  const revision = (): number => editorInstance.getModel()?.getVersionId() ?? 0

  const mostrar = (siVa: boolean): void => {
    if (!widget || siVa === visible) {
      return
    }
    visible = siVa
    if (siVa) {
      editorInstance.addContentWidget(widget)
    } else {
      focoPendiente = false
      editorInstance.removeContentWidget(widget)
    }
  }

  // Monaco agrega el widget con `visibility: hidden` y recién lo muestra cuando dibuja, en el
  // próximo cuadro; un focus() antes de eso no prende y la tecla siguiente cae en el código (y la
  // segunda tecla de un acorde nunca llega al cuadrito). Por eso se le pide que dibuje ya. Si igual
  // no se pudo —el widget quedó fuera de la vista—, entra cuando Monaco lo muestre (`afterRender`).
  const enfocarElCuadrito = (): void => {
    editorInstance.render()
    focoPendiente = !(cuadrito?.enfocar() ?? false)
  }

  const aplicar = (tramo: Tramo, codigo: string): void => {
    const model = editorInstance.getModel()
    if (!model) {
      return
    }
    const { texto, tramoNuevo } = aplicarEdicionEnElLugar(model.getValue(), tramo, codigo)
    const inicio = model.getPositionAt(tramo.desde)
    const fin = model.getPositionAt(tramo.hasta)
    model.pushEditOperations(
      null,
      [
        {
          range: {
            startLineNumber: inicio.lineNumber,
            startColumn: inicio.column,
            endLineNumber: fin.lineNumber,
            endColumn: fin.column
          },
          // El texto ya sangrado, recortado del documento que armó `aplicarEdicionEnElLugar`:
          // así la sangría la decide esa función, que es la que está probada.
          text: texto.slice(tramoNuevo.desde, tramoNuevo.hasta)
        }
      ],
      () => null
    )
    editorInstance.focus()
  }

  const pedir = async (tramo: Tramo, instruccion: string, deLaRevision: number): Promise<void> => {
    const model = editorInstance.getModel()
    const worktreePath = leerWorktreePath()
    if (!model || !worktreePath) {
      // Sin worktree no hay dónde correr el agente, y decirlo es mejor que no hacer nada.
      despachar({
        tipo: 'fallo',
        motivo: translate('editor.inlineEdit.notInWorktree', 'This file is not inside a worktree.'),
        revision: deLaRevision
      })
      return
    }
    const texto = model.getValue()
    const respuesta = await window.api.editor.generateInlineEdit({
      worktreePath,
      prompt: pedidoDeEdicion({
        instruccion,
        seleccion: texto.slice(tramo.desde, tramo.hasta),
        antes: texto.slice(Math.max(0, tramo.desde - CONTEXTO), tramo.desde),
        despues: texto.slice(tramo.hasta, tramo.hasta + CONTEXTO),
        rutaDelArchivo
      })
    })
    despachar(
      respuesta.success
        ? { tipo: 'llego', codigo: respuesta.codigo, revision: deLaRevision }
        : { tipo: 'fallo', motivo: respuesta.error, revision: deLaRevision }
    )
  }

  function despachar(suceso: SucesoEdicion): void {
    const paso = pasoDeEdicion(estado, suceso)
    estado = paso.estado
    mostrar(cuadrito?.dibujar(estado) ?? false)
    if (paso.efecto.tipo === 'pedirAlModelo') {
      void pedir(paso.efecto.tramo, paso.efecto.instruccion, paso.efecto.revision)
    } else if (paso.efecto.tipo === 'aplicar') {
      aplicar(paso.efecto.tramo, paso.efecto.codigo)
    }
  }

  cuadrito = crearCuadrito({
    enviar: (instruccion) => despachar({ tipo: 'enviar', instruccion }),
    aceptar: () => despachar({ tipo: 'aceptar' }),
    descartar: () => {
      despachar({ tipo: 'cancelar' })
      editorInstance.focus()
    },
    reintentar: () => {
      if (estado.fase === 'fallo') {
        despachar({ tipo: 'abrir', tramo: estado.tramo, revision: revision() })
        enfocarElCuadrito()
      }
    }
  })

  const nodo = cuadrito.nodo
  // Captura antes que el campo y que Monaco: la tecla que sigue a Ctrl+K puede ser la segunda
  // de un acorde de Monaco (Ctrl+K Ctrl+C), y en ese caso el cuadrito no tendría que haberse abierto.
  const alApretarEnElCuadrito = (evento: KeyboardEvent): void => {
    if (!esperandoSegundaTecla || esSoloModificador(evento)) {
      return
    }
    esperandoSegundaTecla = false
    const accion = accionDelAcorde(evento, ES_MAC)
    if (!accion) {
      return
    }
    evento.preventDefault()
    evento.stopPropagation()
    despachar({ tipo: 'cancelar' })
    editorInstance.focus()
    void editorInstance.getAction(accion)?.run()
  }
  nodo.addEventListener('keydown', alApretarEnElCuadrito, true)
  widget = {
    getId: () => 'dolphin.edicionEnElLugar',
    getDomNode: () => nodo,
    getPosition: () => {
      const seleccion = editorInstance.getSelection()
      return {
        position: {
          lineNumber: seleccion?.startLineNumber ?? 1,
          column: seleccion?.startColumn ?? 1
        },
        preference: [
          monaco.editor.ContentWidgetPositionPreference.ABOVE,
          monaco.editor.ContentWidgetPositionPreference.BELOW
        ]
      }
    },
    afterRender: (posicion) => {
      if (focoPendiente && visible && posicion) {
        focoPendiente = !(cuadrito?.enfocar() ?? false)
      }
    }
  }

  descartables.push(
    editorInstance.addAction({
      id: 'dolphin.editarEnElLugar',
      label: translate('editor.editWithAi', 'Edit with AI'),
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
      run: () => {
        const model = editorInstance.getModel()
        const seleccion = editorInstance.getSelection()
        if (!model || !seleccion) {
          return
        }
        // Sin selección se toma la línea entera: pedir «hacé esto async» con el cursor en el
        // medio de una función es lo normal, y obligar a seleccionar primero sería ruido.
        const tramo = seleccion.isEmpty()
          ? {
              desde: model.getOffsetAt({ lineNumber: seleccion.startLineNumber, column: 1 }),
              hasta: model.getOffsetAt({
                lineNumber: seleccion.startLineNumber,
                column: model.getLineMaxColumn(seleccion.startLineNumber)
              })
            }
          : {
              desde: model.getOffsetAt(seleccion.getStartPosition()),
              hasta: model.getOffsetAt(seleccion.getEndPosition())
            }
        // Con la selección fuera de la vista el cuadrito no se dibujaría y no podría tomar el foco.
        editorInstance.revealRangeInCenterIfOutsideViewport(seleccion)
        despachar({ tipo: 'abrir', tramo, revision: revision() })
        enfocarElCuadrito()
        esperandoSegundaTecla = true
      }
    })
  )

  // Con el foco en el editor (el texto o el cuadrito), el proceso principal le deja Ctrl+K a
  // Monaco en vez de abrir la paleta de worktrees. Ver `shared/ctrl-k-del-editor-de-codigo.ts`.
  const avisarFoco = (enfocado: boolean): void =>
    avisoDeFocoDelEditor.marcar(editorInstance.getId(), enfocado)
  descartables.push(editorInstance.onDidFocusEditorWidget(() => avisarFoco(true)))
  descartables.push(
    editorInstance.onDidBlurEditorWidget(() => {
      esperandoSegundaTecla = false
      avisarFoco(false)
    })
  )
  if (editorInstance.hasWidgetFocus()) {
    avisarFoco(true)
  }

  descartables.push(
    editorInstance.onDidChangeModelContent(() => {
      despachar({ tipo: 'documentoCambio', revision: revision() })
    })
  )
  descartables.push(
    editorInstance.onDidChangeModel(() => {
      despachar({ tipo: 'cancelar' })
    })
  )

  return {
    dispose: () => {
      nodo.removeEventListener('keydown', alApretarEnElCuadrito, true)
      avisarFoco(false)
      mostrar(false)
      for (const descartable of descartables) {
        descartable.dispose()
      }
      descartables.length = 0
      estado = EDICION_CERRADA
    }
  }
}
