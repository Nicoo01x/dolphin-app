import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'

const store = vi.hoisted(() => {
  const state = {
    unifiedTabsByWorktree: {} as Record<string, unknown[]>,
    groupsByWorktree: {} as Record<string, unknown[]>,
    layoutByWorktree: {} as Record<string, unknown>,
    openFiles: [] as { id: string; filePath: string; worktreeId: string }[],
    activeFileId: null as string | null,
    activeTabType: 'terminal' as string,
    activeFileIdByWorktree: {} as Record<string, string | null>,
    activeTabTypeByWorktree: {} as Record<string, string>,
    activeGroupIdByWorktree: {} as Record<string, string>,
    createEmptySplitGroup: vi.fn(() => 'grupo-nuevo'),
    // Como el de verdad en «background»: marca el archivo como activo y enfoca su grupo.
    openFile: vi.fn((_file: unknown, options: { targetGroupId: string }) => {
      state.activeFileId = 'archivo-1'
      state.activeTabType = 'editor'
      state.activeFileIdByWorktree = { ...state.activeFileIdByWorktree, wt: 'archivo-1' }
      state.activeTabTypeByWorktree = { ...state.activeTabTypeByWorktree, wt: 'editor' }
      state.activeGroupIdByWorktree = {
        ...state.activeGroupIdByWorktree,
        wt: options.targetGroupId
      }
      return 'archivo-1'
    }),
    // Como el de verdad: enfoca el grupo y recalcula lo activo desde su pestaña (acá, la del chat).
    focusGroup: vi.fn((worktreeId: string, groupId: string) => {
      state.activeGroupIdByWorktree = { ...state.activeGroupIdByWorktree, [worktreeId]: groupId }
      state.activeFileId = 'mio'
      state.activeTabType = 'terminal'
    }),
    setEditorViewMode: vi.fn()
  }
  return state
})
const vivo = vi.hoisted(() => ({ grupos: new Set<string>() }))

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('@/lib/links/placement/link-open-intent', () => ({
  isLiveLinkOpenGroup: (_state: unknown, _worktreeId: string, groupId: string) =>
    vivo.grupos.has(groupId)
}))

import {
  __olvidarGruposDeSeguirParaTests,
  abrirAlCostado,
  escrituraNueva,
  escriturasDe,
  rutaDentroDelWorktree
} from './seguir-archivos'

const assistant = (id: string, blocks: NativeChatMessage['blocks']): NativeChatMessage => ({
  id,
  role: 'assistant',
  blocks,
  timestamp: null,
  source: 'transcript'
})

describe('las escrituras del agente', () => {
  it('son las que salieron bien, en orden y con una clave estable', () => {
    expect(
      escriturasDe([
        assistant('1', [
          { type: 'tool-call', name: 'Read', input: { file_path: 'C:/repo/a.ts' } },
          { type: 'tool-call', name: 'Write', input: { file_path: 'C:/repo/a.ts' }, callId: 'w' },
          {
            type: 'tool-call',
            name: 'Edit',
            input: JSON.stringify({ file_path: 'C:/repo/b.ts' })
          },
          // Una que se rechazó no cambió nada: no cuenta.
          { type: 'tool-call', name: 'Edit', input: { file_path: 'C:/repo/c.ts' }, callId: 'x' },
          { type: 'tool-result', output: 'rechazado', isError: true, callId: 'x' }
        ])
      ])
    ).toEqual([
      { path: 'C:/repo/a.ts', clave: 'w' },
      { path: 'C:/repo/b.ts', clave: '1#2' }
    ])
    expect(escriturasDe([assistant('1', [{ type: 'text', text: 'hola' }])])).toEqual([])
  })

  it('cargar mensajes más viejos no hace nueva a la última, y una escritura de verdad sí', () => {
    const nueva = assistant('9', [
      { type: 'tool-call', name: 'Write', input: { file_path: 'C:/repo/n.ts' }, callId: 'n' }
    ])
    const vieja = assistant('1', [
      { type: 'tool-call', name: 'Write', input: { file_path: 'C:/repo/v.ts' }, callId: 'v' }
    ])
    const vistas = new Set(escriturasDe([nueva]).map((e) => e.clave))
    expect(escrituraNueva(vistas, escriturasDe([vieja, nueva]))).toBeNull()

    const otra = assistant('10', [
      { type: 'tool-call', name: 'Edit', input: { file_path: 'C:/repo/o.ts' }, callId: 'o' }
    ])
    expect(escrituraNueva(vistas, escriturasDe([vieja, nueva, otra]))?.path).toBe('C:/repo/o.ts')
  })

  it('si la última falla después, la anterior ya se había visto: no se abre', () => {
    const mensajes = [
      assistant('1', [
        { type: 'tool-call', name: 'Write', input: { file_path: 'C:/repo/a.ts' }, callId: 'a' },
        { type: 'tool-call', name: 'Write', input: { file_path: 'C:/repo/b.ts' }, callId: 'b' }
      ])
    ]
    const vistas = new Set(escriturasDe(mensajes).map((e) => e.clave))
    mensajes[0].blocks.push({ type: 'tool-result', output: 'no', isError: true, callId: 'b' })
    expect(escrituraNueva(vistas, escriturasDe(mensajes))).toBeNull()
  })
})

describe('la ruta dentro del worktree', () => {
  it('sale relativa y con «/», con cualquier separador y mayúscula de unidad', () => {
    expect(rutaDentroDelWorktree('D:\\Proyectos\\app', 'D:\\Proyectos\\app\\src\\a.ts')).toBe(
      'src/a.ts'
    )
    expect(rutaDentroDelWorktree('D:/Proyectos/app/', 'd:/proyectos/app/README.md')).toBe(
      'README.md'
    )
    expect(rutaDentroDelWorktree('/home/n/app', '/home/n/app/src/b.ts')).toBe('src/b.ts')
    expect(rutaDentroDelWorktree('/home/n/app', 'src/c.ts')).toBe('src/c.ts')
  })

  it('una «relativa» a otra unidad (`D:foo`) no es del worktree', () => {
    expect(rutaDentroDelWorktree('D:\\Proyectos\\app', 'D:Proyectosapp.md')).toBeNull()
  })

  it('en WSL el agente la nombra como la ve Linux', () => {
    expect(
      rutaDentroDelWorktree('\\\\wsl.localhost\\Ubuntu\\home\\nico\\app', '/home/nico/app/src/a.ts')
    ).toBe('src/a.ts')
  })

  it('una «İ» en la raíz no corre el corte (en minúsculas son dos caracteres)', () => {
    expect(rutaDentroDelWorktree('C:\\Users\\İnci\\app', 'c:/users/İnci/app/src/a.ts')).toBe(
      'src/a.ts'
    )
  })

  it('es null para lo que cae afuera: otra carpeta, una vecina con el mismo prefijo o «..»', () => {
    expect(rutaDentroDelWorktree('D:/Proyectos/app', 'D:/Proyectos/otra/a.ts')).toBeNull()
    expect(rutaDentroDelWorktree('D:/Proyectos/app', 'D:/Proyectos/app2/a.ts')).toBeNull()
    expect(rutaDentroDelWorktree('D:/Proyectos/app', 'D:/Proyectos/app/../x.ts')).toBeNull()
    expect(rutaDentroDelWorktree('D:/Proyectos/app', '../x.ts')).toBeNull()
  })
})

describe('abrir al costado', () => {
  const contexto = {
    worktreeId: 'wt',
    worktreePath: 'D:\\Proyectos\\app',
    runtimeEnvironmentId: null,
    sourceTabId: 'terminal-1'
  }

  beforeEach(() => {
    vi.clearAllMocks()
    __olvidarGruposDeSeguirParaTests()
    vivo.grupos = new Set(['grupo-chat'])
    store.unifiedTabsByWorktree = {
      wt: [
        { id: 'tab-chat', entityId: 'terminal-1', contentType: 'terminal', groupId: 'grupo-chat' }
      ]
    }
    store.groupsByWorktree = { wt: [{ id: 'grupo-chat', activeTabId: 'tab-chat' }] }
    store.openFiles = []
    store.activeFileId = 'mio'
    store.activeTabType = 'terminal'
    store.activeFileIdByWorktree = { wt: 'mio' }
    store.activeTabTypeByWorktree = { wt: 'terminal' }
    store.activeGroupIdByWorktree = { wt: 'grupo-chat' }
  })

  it('el foco vuelve a donde estaba: Ctrl+S no va al archivo del agente', () => {
    abrirAlCostado(contexto, 'D:/Proyectos/app/src/a.ts')
    expect(store.focusGroup).toHaveBeenCalledWith('wt', 'grupo-chat')
    expect(store.activeGroupIdByWorktree.wt).toBe('grupo-chat')
    expect(store.activeFileId).toBe('mio')
    expect(store.activeTabType).toBe('terminal')
  })

  it('si la persona ya tenía el archivo abierto no le cambia el modo de su pestaña', () => {
    store.openFiles = [
      { id: 'archivo-1', filePath: 'd:\\proyectos\\app\\src\\a.ts', worktreeId: 'wt' }
    ]
    abrirAlCostado(contexto, 'D:/Proyectos/app/src/a.ts')
    expect(store.openFile).toHaveBeenCalled()
    expect(store.setEditorViewMode).not.toHaveBeenCalled()
  })

  it('no usa el editor que la persona tiene enfocado', () => {
    vivo.grupos.add('grupo-editor')
    store.unifiedTabsByWorktree.wt.push({
      id: 'tab-editor',
      contentType: 'editor',
      groupId: 'grupo-editor'
    })
    store.groupsByWorktree.wt.push({ id: 'grupo-editor', activeTabId: 'tab-editor' })
    store.activeGroupIdByWorktree = { wt: 'grupo-editor' }

    abrirAlCostado(contexto, 'D:/Proyectos/app/src/a.ts')

    expect(store.openFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetGroupId: 'grupo-nuevo' })
    )
  })

  it('abre un grupo a la derecha del chat y muestra el archivo en modo cambios, sin robar el foco', () => {
    expect(abrirAlCostado(contexto, 'D:/Proyectos/app/src/a.ts')).toBe(true)

    expect(store.createEmptySplitGroup).toHaveBeenCalledWith('wt', 'grupo-chat', 'right', {
      activate: false
    })
    expect(store.openFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: 'D:\\Proyectos\\app\\src\\a.ts',
        relativePath: 'src/a.ts',
        worktreeId: 'wt',
        mode: 'edit'
      }),
      { preview: true, targetGroupId: 'grupo-nuevo', selection: 'background', focusEditor: false }
    )
    expect(store.setEditorViewMode).toHaveBeenCalledWith('archivo-1', 'changes')
  })

  it('la segunda vez usa el mismo grupo', () => {
    vivo.grupos.add('grupo-nuevo')
    abrirAlCostado(contexto, 'D:/Proyectos/app/src/a.ts')
    abrirAlCostado(contexto, 'D:/Proyectos/app/src/b.ts')
    expect(store.createEmptySplitGroup).toHaveBeenCalledTimes(1)
    expect(store.openFile).toHaveBeenLastCalledWith(
      expect.objectContaining({ relativePath: 'src/b.ts' }),
      expect.objectContaining({ targetGroupId: 'grupo-nuevo' })
    )
  })

  it('si ya hay un editor a la vista al lado, lo usa en vez de abrir otro grupo', () => {
    vivo.grupos.add('grupo-editor')
    store.unifiedTabsByWorktree.wt.push({
      id: 'tab-editor',
      contentType: 'editor',
      groupId: 'grupo-editor'
    })
    store.groupsByWorktree.wt.push({ id: 'grupo-editor', activeTabId: 'tab-editor' })

    abrirAlCostado(contexto, 'D:/Proyectos/app/src/a.ts')

    expect(store.createEmptySplitGroup).not.toHaveBeenCalled()
    expect(store.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: 'src/a.ts' }),
      expect.objectContaining({ targetGroupId: 'grupo-editor' })
    )
  })

  it('no abre nada fuera del worktree ni si la pestaña del chat ya no está', () => {
    expect(abrirAlCostado(contexto, 'C:/Windows/system.ini')).toBe(false)
    store.unifiedTabsByWorktree = { wt: [] }
    expect(abrirAlCostado(contexto, 'D:/Proyectos/app/src/a.ts')).toBe(false)
    expect(store.openFile).not.toHaveBeenCalled()
  })
})
