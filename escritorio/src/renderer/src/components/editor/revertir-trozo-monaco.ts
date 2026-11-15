import type * as monacoEditor from 'monaco-editor'
import type { IDisposable, editor } from 'monaco-editor'
import { translate } from '@/i18n/i18n'
import type { Hunk } from './bordes-de-git'
import type { BordeDeGit } from './bordes-de-git-en-monaco'
import { crearFlotanteDelTrozo } from './revertir-trozo-flotante'

type MonacoApi = typeof monacoEditor

/** Las clases de las rayitas (`bordes-de-git-en-monaco.ts`): sólo un clic ahí abre el flotante. */
const CLASES_DEL_BORDE = ['borde-git-agregado', 'borde-git-cambiado', 'borde-git-borrado']

/** La línea donde se dibuja la rayita de un trozo; un borrado no tiene líneas propias. */
export function lineaDelTrozo(hunk: Hunk): number {
  return hunk.tipo === 'borrado' ? Math.max(1, hunk.desde - 1) : hunk.desde
}

/** El trozo de esa línea o, si no hay, el siguiente (y vuelta al primero al final del archivo). */
export function trozoDesde(hunks: readonly Hunk[], enEsa: Hunk | null, linea: number): Hunk | null {
  if (enEsa) {
    return enEsa
  }
  return hunks.find((hunk) => lineaDelTrozo(hunk) > linea) ?? hunks[0] ?? null
}

function esDelBorde(elemento: Element | null): boolean {
  return CLASES_DEL_BORDE.some((clase) => elemento?.classList.contains(clase) === true)
}

/** Lo que el `::before` de la rayita agranda la zona de clic hacia la izquierda (`tema-dolphin.css`). */
const HOLGURA_DEL_CLIC = 4

/**
 * ¿El clic cayó sobre la rayita aunque arriba haya otra decoración del mismo carril? En las líneas
 * que se pliegan, el ícono de plegado de Monaco (26 px) tapa la rayita; Monaco deja sus primeros
 * 4 px sin plegar justamente para el borde de cambios (`folding.js`, «gutterOffsetX < 4»), así
 * que acá se mira la posición: desde la holgura izquierda hasta el borde derecho de la rayita.
 */
function caeSobreLaRayita(elemento: Element | null, x: number): boolean {
  if (esDelBorde(elemento)) {
    return true
  }
  // Las decoraciones del carril (`cldr`) son hermanas dentro de la fila del margen.
  const fila = elemento?.classList.contains('cldr') ? elemento.parentElement : elemento
  const rayita = fila?.querySelector(CLASES_DEL_BORDE.map((clase) => `.${clase}`).join(','))
  if (!rayita) {
    return false
  }
  const caja = rayita.getBoundingClientRect()
  return x >= caja.left - HOLGURA_DEL_CLIC && x <= caja.right
}

/**
 * Revertir un trozo desde la rayita del margen: clic en la rayita (o Alt+F5 con el cursor en la
 * línea, o antes del próximo cambio) abre un flotante con lo que decía git y «Revertir este
 * cambio». Revertir pasa por `borde.revertir`, que usa `executeEdits`: Ctrl+Z lo deshace.
 */
export function instalarRevertirTrozo(args: {
  readonly monaco: MonacoApi
  readonly editor: editor.IStandaloneCodeEditor
  readonly borde: BordeDeGit
}): IDisposable {
  const { monaco, editor: editorInstance, borde } = args
  let abierto: Hunk | null = null
  let visible = false

  const cerrar = (devolverFoco: boolean): void => {
    if (!visible) {
      return
    }
    editorInstance.removeContentWidget(widget)
    visible = false
    abierto = null
    if (devolverFoco) {
      editorInstance.focus()
    }
  }

  const flotante = crearFlotanteDelTrozo({
    revertir: () => {
      const trozo = abierto
      cerrar(true)
      if (trozo) {
        borde.revertir(trozo)
      }
    },
    cerrar: () => cerrar(true)
  })

  const widget: editor.IContentWidget = {
    getId: () => 'dolphin.revertirTrozo',
    getDomNode: () => flotante.nodo,
    getPosition: () =>
      abierto
        ? {
            position: { lineNumber: lineaDelTrozo(abierto), column: 1 },
            preference: [
              monaco.editor.ContentWidgetPositionPreference.BELOW,
              monaco.editor.ContentWidgetPositionPreference.ABOVE
            ]
          }
        : null
  }

  const abrir = (hunk: Hunk): void => {
    abierto = hunk
    flotante.mostrar(hunk)
    if (visible) {
      editorInstance.layoutContentWidget(widget)
    } else {
      editorInstance.addContentWidget(widget)
      visible = true
    }
    // Después del clic: Monaco devuelve el foco al texto cuando termina de procesar el mouse.
    setTimeout(() => flotante.enfocar(), 0)
  }

  const descartables: IDisposable[] = [
    editorInstance.onMouseDown((evento) => {
      const enElBorde =
        evento.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS &&
        caeSobreLaRayita(evento.target.element, evento.event.browserEvent.clientX)
      const linea = evento.target.position?.lineNumber
      const trozo = enElBorde && linea ? borde.hunkEn(linea) : null
      if (trozo) {
        abrir(trozo)
        return
      }
      cerrar(false)
    }),
    // Con el texto cambiado el trozo ya no es el que se mostró: revertirlo pisaría otra cosa.
    editorInstance.onDidChangeModelContent(() => cerrar(false)),
    editorInstance.addAction({
      id: 'dolphin.verCambioDeGit',
      label: translate('editor.gitHunk.showAction', 'Show Git Change'),
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.F5],
      run: () => {
        const linea = editorInstance.getPosition()?.lineNumber ?? 1
        const trozo = trozoDesde(borde.hunks(), borde.hunkEn(linea), linea)
        if (trozo) {
          editorInstance.revealLineInCenterIfOutsideViewport(lineaDelTrozo(trozo))
          abrir(trozo)
        }
      }
    })
  ]

  return {
    dispose: () => {
      cerrar(false)
      for (const descartable of descartables) {
        descartable.dispose()
      }
    }
  }
}
