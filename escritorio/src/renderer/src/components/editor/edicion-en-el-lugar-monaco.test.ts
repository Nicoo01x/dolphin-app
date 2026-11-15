// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({ translate: (_clave: string, texto: string) => texto }))

import { instalarEdicionEnElLugar } from './edicion-en-el-lugar-monaco'

type Widget = {
  getDomNode: () => HTMLElement
  afterRender?: (posicion: unknown, coordenada: unknown) => void
}

/**
 * Un editor de mentira con la regla de Monaco que importa acá: `addContentWidget` deja el nodo en
 * el DOM pero invisible, y recién se ve cuando el editor dibuja (`render`, o el próximo cuadro).
 * Chromium no le da el foco a un nodo invisible; happy-dom sí, así que esa regla se imita abajo.
 */
function montar(opciones: { fueraDeLaVista?: boolean } = {}) {
  const widgets: Widget[] = []
  const dibujados = new WeakSet<HTMLElement>()
  let accion: { run: () => void } | null = null
  let fueraDeLaVista = opciones.fueraDeLaVista === true
  const correrAcorde = vi.fn()
  const dibujar = (): void => {
    for (const widget of widgets) {
      const visible = !fueraDeLaVista
      if (visible) {
        dibujados.add(widget.getDomNode())
      }
      widget.afterRender?.(visible ? { lineNumber: 1, column: 1 } : null, null)
    }
  }
  const editor = {
    getId: () => 'editor-1',
    getModel: () => ({
      getVersionId: () => 1,
      getValue: () => 'const a = 1\n',
      getOffsetAt: ({ column }: { column: number }) => column - 1,
      getLineMaxColumn: () => 12
    }),
    getSelection: () => ({ isEmpty: () => true, startLineNumber: 1, startColumn: 1 }),
    addContentWidget: (widget: Widget) => {
      widgets.push(widget)
      document.body.appendChild(widget.getDomNode())
    },
    removeContentWidget: (widget: Widget) => {
      widgets.splice(widgets.indexOf(widget), 1)
      widget.getDomNode().remove()
    },
    render: dibujar,
    revealRangeInCenterIfOutsideViewport: vi.fn(),
    addAction: (a: { run: () => void }) => {
      accion = a
      return { dispose: () => {} }
    },
    getAction: (id: string) => ({ run: () => correrAcorde(id) }),
    focus: vi.fn(),
    hasWidgetFocus: () => false,
    onDidFocusEditorWidget: () => ({ dispose: () => {} }),
    onDidBlurEditorWidget: () => ({ dispose: () => {} }),
    onDidChangeModelContent: () => ({ dispose: () => {} }),
    onDidChangeModel: () => ({ dispose: () => {} })
  }
  const monaco = {
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { KeyK: 41 },
    editor: { ContentWidgetPositionPreference: { ABOVE: 1, BELOW: 2 } }
  }
  const focoOriginal = HTMLElement.prototype.focus
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement) {
    const widget = this.closest('.dolphin-cmdk')
    if (!(widget instanceof HTMLElement) || dibujados.has(widget)) {
      focoOriginal.call(this)
    }
  })
  instalarEdicionEnElLugar({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Monaco y el editor de mentira tienen sólo lo que el cuadrito usa.
    monaco: monaco as unknown as Parameters<typeof instalarEdicionEnElLugar>[0]['monaco'],
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Monaco y el editor de mentira tienen sólo lo que el cuadrito usa.
    editor: editor as unknown as Parameters<typeof instalarEdicionEnElLugar>[0]['editor'],
    rutaDelArchivo: 'src/a.ts',
    leerWorktreePath: () => '/repo'
  })
  const entrada = (): HTMLInputElement | null => document.querySelector('.dolphin-cmdk-entrada')
  return {
    widgets,
    correrAcorde,
    ctrlK: () => accion?.run(),
    dibujar,
    entrada,
    ponerEnLaVista: () => {
      fueraDeLaVista = false
    }
  }
}

describe('Ctrl+K le pasa el foco al cuadrito', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('la letra que sigue va al cuadrito, no al código', () => {
    // El bug: el focus() salía antes de que Monaco dibujara el widget y no prendía.
    const m = montar()
    m.ctrlK()
    expect(m.widgets).toHaveLength(1)
    expect(document.activeElement).toBe(m.entrada())
  })

  it('Ctrl+K Ctrl+C desde el primer Ctrl+K: comenta y cierra el cuadrito', () => {
    const m = montar()
    m.ctrlK()
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true })
    )
    expect(m.correrAcorde).toHaveBeenCalledWith('editor.action.addCommentLine')
    expect(m.widgets).toHaveLength(0)
  })

  it('si Monaco no pudo mostrarlo enseguida, el foco entra cuando lo muestra', () => {
    const m = montar({ fueraDeLaVista: true })
    m.ctrlK()
    expect(document.activeElement).not.toBe(m.entrada())
    // El cuadro siguiente: Monaco ya lo tiene en la vista.
    m.ponerEnLaVista()
    m.dibujar()
    expect(document.activeElement).toBe(m.entrada())
  })
})
