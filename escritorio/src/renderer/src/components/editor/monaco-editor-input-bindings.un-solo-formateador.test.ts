// @vitest-environment happy-dom
import type { editor } from 'monaco-editor'
import { expect, it, vi } from 'vitest'
import { installMonacoEditorInputBindings } from './monaco-editor-input-bindings'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: el valor inicial del guardado capturado.
const { alGuardar } = vi.hoisted(() => ({ alGuardar: { actual: null as null | (() => void) } }))

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ settings: { editorFormatOnSave: true } }) }
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./editor-shortcuts', () => ({
  installEditorSaveShortcut: (_nodo: HTMLElement, guardar: () => void) => {
    alGuardar.actual = guardar
    return () => undefined
  },
  installMonacoEditorFindShortcut: () => () => undefined,
  installEditorAddReviewNoteShortcut: () => () => undefined
}))

// El bug: con «formatear al guardar» prendido se formateaba dos veces, una con el LSP acá (antes
// del guardado) y otra con el formateador del repo en la cadena de guardado de la base.
it('Cmd+S guarda el texto tal cual y deja el formato a la cadena de guardado', () => {
  const contenedor = document.createElement('div')
  const getAction = vi.fn()
  const onSave = vi.fn()
  const editorFalso = {
    getValue: () => 'const a=1',
    getContainerDomNode: () => contenedor,
    getAction,
    addAction: () => ({ dispose: () => undefined })
  }
  const enlaces = installMonacoEditorInputBindings({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: guardar sólo usa los métodos de arriba.
    editorInstance: editorFalso as unknown as editor.IStandaloneCodeEditor,
    worktreeId: undefined,
    editorContainerRef: { current: contenedor },
    propsRef: {
      current: {
        relativePath: 'a.ts',
        language: 'typescript',
        onSave,
        onContentChange: vi.fn()
      }
    },
    readOnlyRef: { current: false },
    commentPopoverRef: { current: null },
    shouldShowMarkdownAnnotationsRef: { current: false },
    setCommentPopover: vi.fn(),
    setSelectionAnnotationTarget: vi.fn()
  })

  alGuardar.actual?.()

  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onSave).toHaveBeenCalledWith('const a=1')
  expect(getAction).not.toHaveBeenCalledWith('editor.action.formatDocument')
  enlaces.disposeInputBindings()
})
