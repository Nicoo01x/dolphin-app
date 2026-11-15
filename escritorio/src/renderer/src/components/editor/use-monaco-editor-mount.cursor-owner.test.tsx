// @vitest-environment happy-dom
import { cleanup, render, renderHook } from '@testing-library/react'
import { Children, Suspense, type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { editor, IRange } from 'monaco-editor'
import type { OnMount } from '@monaco-editor/react'
import type { StoreApi } from 'zustand'
import type { AppState } from '@/store/types'
import { createEditorTabsStore } from '@/store/slices/editor/editor-slice-test-harness'
import '@/lib/editor/file-operations/editor-file-operation-owner'
import { captureEditorFileOperationProvenance } from '@/lib/editor/file-operations/editor-file-operation-provenance'
import type { MonacoEditorMountParams } from './monaco-editor-mount-params'
import { useMonacoEditorMount } from './use-monaco-editor-mount'
import { MonacoGutterContextMenu } from './MonacoGutterContextMenu'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
const menuActions = vi.hoisted(() => new Map<string, () => unknown>())
vi.mock('@/components/ui/dropdown-menu', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuItem: ({
      children,
      onSelect
    }: {
      children: ReactNode
      onSelect: () => unknown
    }) => {
      const label = Children.toArray(children).find((child) => typeof child === 'string')
      menuActions.set(String(label), onSelect)
      return null
    }
  }
})
vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({
  callRuntimeRpc: vi.fn()
}))

import { conEscuchas } from './monaco-mount-listener-proxy.test-fixture'
const storeRef = vi.hoisted((): { current?: StoreApi<AppState> } => ({}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => storeRef.current?.getState() }
}))
vi.mock('./markdown-source-tools/monaco/monaco-markdown-doc-link-decorations', () => ({
  createMarkdownDocLinkDecorationController: vi.fn()
}))
vi.mock('./markdown-source-tools/monaco/monaco-markdown-doc-completions', () => ({
  ensureMarkdownDocCompletionProvider: vi.fn()
}))
vi.mock('./monaco-e2e-probe', () => ({ installMonacoE2EProbe: () => vi.fn() }))
vi.mock('./monaco-editor-input-bindings', () => ({
  installMonacoEditorInputBindings: () => ({ disposeInputBindings: vi.fn() })
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function mountParams(
  store: StoreApi<AppState>,
  fileId: string,
  filePath: string
): MonacoEditorMountParams {
  return {
    fileId,
    filePath,
    viewStateKey: 'stable-tab-view',
    viewStateId: 'stable-tab',
    worktreeId: 'old-workspace',
    autoHeight: false,
    autoHeightLineHeight: 20,
    editorRef: { current: null },
    editorContainerRef: { current: null },
    languageRef: { current: 'typescript' },
    propsRef: {
      current: {
        relativePath: 'file.ts',
        language: 'typescript',
        onSave: vi.fn(),
        onContentChange: vi.fn()
      }
    },
    readOnlyRef: { current: false },
    scrollThrottleTimerRef: { current: null },
    unregisterFileSearchSelectionRef: { current: null },
    setMountedEditor: vi.fn(),
    setAutoHeightContentHeight: vi.fn(),
    setEditorCursorLine: store.getState().setEditorCursorLine,
    setupCopy: vi.fn(),
    queueReveal: vi.fn(),
    contentSync: {
      contentRef: { current: '' },
      lastSyncedContentRef: { current: '' },
      contentSyncModeRef: { current: 'undoable' },
      isApplyingProgrammaticContentRef: { current: false }
    },
    decorations: {
      markdownDocLinkDecorationsRef: { current: null },
      conflictDecorationsRef: { current: null },
      updateMarkdownCompletionDocuments: vi.fn()
    },
    annotations: {
      commentPopoverRef: { current: null },
      shouldShowMarkdownAnnotationsRef: { current: false },
      setCommentPopover: vi.fn(),
      setSelectionAnnotationTarget: vi.fn()
    },
    gutterMenu: {
      setGutterMenuOpen: vi.fn(),
      setGutterMenuPoint: vi.fn(),
      setGutterMenuLine: vi.fn(),
      setGutterMenuSelection: vi.fn()
    }
  }
}

it('keeps cursor and gutter copy on the current file owner after migration', async () => {
  const store = createEditorTabsStore()
  storeRef.current = store
  const filePath = '/repo/file.ts'
  const oldId = 'restored-file'
  store.setState({
    activeFileId: null,
    openFiles: [
      {
        id: oldId,
        filePath,
        relativePath: 'file.ts',
        worktreeId: 'old-workspace',
        language: 'typescript',
        mode: 'edit',
        isDirty: false
      }
    ],
    runtimeEnvironments: [],
    detectedWorktreesByRepo: {}
  })
  const params = mountParams(store, oldId, filePath)
  type EscuchaDeCursor = (event: { position: { lineNumber: number; column: number } }) => void
  // Todos los que se engancharon al cursor, no «el último que ganó»: desde que existe el Tab
  // predictivo son DOS, y quedarse con uno hacía que la prueba midiera al que no era.
  const escuchasDeCursor: EscuchaDeCursor[] = []
  const emitCursor: EscuchaDeCursor = (evento) => {
    // Una copia: un escucha puede soltarse a sí mismo mientras se recorre la lista.
    const ahora = escuchasDeCursor.slice()
    for (const escucha of ahora) {
      escucha(evento)
    }
  }
  let disposeEditor: (() => void) | undefined
  const cursorDispose = vi.fn()
  let mouseDown: (event: unknown) => void = () => {}
  let selection: IRange = { startLineNumber: 10, startColumn: 1, endLineNumber: 21, endColumn: 1 }
  const mockEditor = {
    getSelection: () => selection,
    setPosition: () => {
      selection = { ...selection, startLineNumber: 15, endLineNumber: 15 }
    },
    getModel: () => null,
    getPosition: () => ({ lineNumber: 1, column: 1 }),
    focus: vi.fn(),
    // Las ayudas de edición y el borde de git se enganchan a estos tres en el montaje. Faltaban
    // y el montaje tiraba antes de llegar a lo que este archivo prueba.
    onDidChangeModelContent: () => ({ dispose: vi.fn() }),
    onDidChangeModel: () => ({ dispose: vi.fn() }),
    createDecorationsCollection: () => ({ set: vi.fn(), clear: vi.fn() }),
    createContextKey: () => ({ set: () => {}, get: () => false, reset: () => {} }),
    hasTextFocus: () => false,
    getSelections: () => [],
    getContribution: () => null,
    getVisibleRanges: () => [],
    getScrollTop: () => 0,
    getContainerDomNode: () => ({ addEventListener: () => {}, removeEventListener: () => {} }),
    getDomNode: () => null,
    revealLineInCenter: () => {},
    trigger: () => {},
    getAction: () => null,
    getOption: () => undefined,
    addCommand: () => null,
    addAction: () => ({ dispose: () => {} }),
    // El montaje engancha el cursor en DOS lados desde que existe el Tab predictivo: la
    // persistencia de la vista —que es lo que este archivo prueba— y la marca de la predicción.
    // El fake se quedaba con el ÚLTIMO escucha y le daba a los dos el mismo `dispose`, así que
    // la prueba terminaba midiendo al que no era y contando dos cierres como si fuera una fuga.
    onDidChangeCursorPosition: (listener: EscuchaDeCursor) => {
      escuchasDeCursor.push(listener)
      return {
        dispose: () => {
          const i = escuchasDeCursor.indexOf(listener)
          if (i !== -1) {
            escuchasDeCursor.splice(i, 1)
          }
          cursorDispose()
        }
      }
    },
    onDidScrollChange: () => ({ dispose: vi.fn() }),
    onMouseDown: (listener: typeof mouseDown) => {
      mouseDown = listener
      return { dispose: vi.fn() }
    },
    onDidDispose: (listener: () => void) => {
      disposeEditor = listener
    }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Mount and tracking use only the editor methods mocked above; decorations/input/probe integrations are mocked.
  const editorInstance = conEscuchas(mockEditor) as unknown as editor.IStandaloneCodeEditor
  // Why no sólo el enum del margen: el montaje instala el Tab predictivo de Dolphin, que lee
  // `monaco.KeyCode` y `monaco.KeyMod` para registrar sus atajos (así estaba en master; el merge
  // se había quedado con el objeto de la base y el montaje tiraba antes de llegar a lo que se prueba).
  const monaco = {
    KeyCode: { Tab: 2, Escape: 9, Enter: 3 },
    KeyMod: { CtrlCmd: 2048, Shift: 1024, Alt: 512 },
    languages: {
      registerInlineCompletionsProvider: () => ({ dispose: () => {} }),
      registerCompletionItemProvider: () => ({ dispose: () => {} })
    },
    editor: { MouseTargetType: { GUTTER_LINE_NUMBERS: 3 }, setModelMarkers: () => {} },
    Range: class {
      constructor(
        public startLineNumber: number,
        public startColumn: number,
        public endLineNumber: number,
        public endColumn: number
      ) {}
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: el montaje sólo usa lo de arriba.
  } as unknown as Parameters<OnMount>[1]
  const suspendedRender = vi.fn()
  const neverCommits = new Promise<void>(() => {})
  const view = renderHook(
    ({ next, suspend }: { next: MonacoEditorMountParams; suspend: boolean }) => {
      const onMount = useMonacoEditorMount(next)
      if (suspend) {
        suspendedRender()
        throw neverCommits
      }
      return onMount
    },
    {
      initialProps: { next: params, suspend: false },
      wrapper: ({ children }) => <Suspense fallback={null}>{children}</Suspense>
    }
  )
  view.result.current(editorInstance, monaco)
  expect(store.getState().editorCursorLine).toEqual({ [oldId]: 1 })

  view.rerender({ next: { ...params, fileId: 'uncommitted-owner' }, suspend: true })
  expect(suspendedRender).toHaveBeenCalled()
  emitCursor({ position: { lineNumber: 7, column: 1 } })
  expect(store.getState().editorCursorLine).toEqual({ [oldId]: 7 })

  const result = store.getState().reparentRestoredEditorFileOwner({
    fileId: oldId,
    targetWorktreeId: 'wt-1',
    targetRelativePath: 'file.ts',
    targetExecutionHostId: 'local',
    targetRuntimeEnvironmentId: null,
    targetOperationProvenance: captureEditorFileOperationProvenance(
      store.getState(),
      'wt-1',
      null,
      true
    )
  })
  expect(result.ok).toBe(true)
  if (!result.ok) {
    throw new Error(`Owner migration failed: ${result.reason}`)
  }
  expect(store.getState().openFiles[0].filePath).toBe(filePath)
  view.rerender({
    next: { ...params, fileId: result.fileId, worktreeId: 'wt-1' },
    suspend: false
  })
  emitCursor({ position: { lineNumber: 42, column: 1 } })

  expect(store.getState().editorCursorLine).toEqual({ [result.fileId]: 42 })
  vi.stubGlobal('api', { git: { remoteFileUrl: vi.fn() }, ui: { writeClipboardText: vi.fn() } })
  const snapshot = { ...selection }
  mouseDown({
    event: Object.assign(new MouseEvent('mousedown'), { rightButton: true }),
    target: { type: 3, position: { lineNumber: 15 } }
  })
  expect(params.gutterMenu.setGutterMenuSelection).toHaveBeenCalledWith(snapshot)
  expect(selection).not.toEqual(snapshot)
  const copiedUrl = 'https://github.com/org/repo/blob/main/file.ts#L10-L20'
  const local = vi.spyOn(window.api.git, 'remoteFileUrl').mockResolvedValue(copiedUrl)
  const clipboard = vi.spyOn(window.api.ui, 'writeClipboardText')
  for (const runtimeEnvironmentId of [null, 'paired']) {
    store.setState({ openFiles: [{ ...store.getState().openFiles[0], runtimeEnvironmentId }] })
    const transport = runtimeEnvironmentId ? vi.mocked(callRuntimeRpc) : local
    transport.mockResolvedValue(copiedUrl)
    for (const line of [15, 21]) {
      const menu = render(
        <MonacoGutterContextMenu
          open
          onOpenChange={vi.fn()}
          point={{ x: 0, y: 0 }}
          line={line}
          selection={snapshot}
          fileId={result.fileId}
          filePath={filePath}
          relativePath="file.ts"
        />
      )
      const action = menuActions.get('Copy Remote URL')!
      menu.unmount()
      await action()
      const expected = {
        relativePath: 'file.ts',
        line: line === 15 ? 10 : line,
        endLine: line === 15 ? 20 : undefined
      }
      const owner = runtimeEnvironmentId
        ? [
            { kind: 'environment', environmentId: 'paired' },
            'git.remoteFileUrl',
            { worktree: 'id:wt-1', ...expected },
            { timeoutMs: 15_000 }
          ]
        : [{ worktreePath: '/repo', connectionId: undefined, ...expected }]
      expect(transport).toHaveBeenLastCalledWith(...owner)
      expect(clipboard).toHaveBeenLastCalledWith(copiedUrl)
      clipboard.mockClear()
      transport.mockResolvedValueOnce(null)
      await action()
      expect(clipboard).not.toHaveBeenCalled()
      transport.mockRejectedValueOnce(new Error('owner unavailable'))
      await expect(action()).rejects.toThrow('owner unavailable')
      expect(clipboard).not.toHaveBeenCalled()
    }
  }
  disposeEditor?.()
  // Lo que importa no es cuántos se engancharon, sino que no quede ninguno colgado.
  expect(escuchasDeCursor).toHaveLength(0)
  expect(cursorDispose).toHaveBeenCalled()
  params.unregisterFileSearchSelectionRef.current?.()
  view.unmount()
  store.getState().closeFile(result.fileId)
  expect(store.getState().editorCursorLine).toEqual({})
})
