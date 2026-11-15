import { describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { desacoplarEditor, editorDesacoplable } from './desacoplar-editor'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'

function archivo(extra: Partial<OpenFile> = {}): OpenFile {
  return {
    id: 'D:/repo/src/a.ts',
    filePath: 'D:/repo/src/a.ts',
    relativePath: 'src/a.ts',
    worktreeId: 'wt-1',
    language: 'typescript',
    isDirty: false,
    mode: 'edit',
    ...extra
  }
}

const base = {
  openFiles: [archivo()],
  entityId: 'D:/repo/src/a.ts',
  tabWorktreeId: 'wt-1',
  panelFlotanteHabilitado: true
}

describe('editorDesacoplable', () => {
  it('accepts a plain local file', () => {
    const resultado = editorDesacoplable(base)
    expect(typeof resultado === 'string' ? resultado : resultado.archivo.filePath).toBe(
      'D:/repo/src/a.ts'
    )
  })

  it('says nothing when the floating panel is off', () => {
    // Sin el panel no hay a dónde sacarlo: el menú esconde la opción en vez de ofrecer un destino
    // que no existe.
    expect(editorDesacoplable({ ...base, panelFlotanteHabilitado: false })).toBe('panel-apagado')
  })

  it('does not offer to detach what is already detached', () => {
    expect(
      editorDesacoplable({
        ...base,
        tabWorktreeId: FLOATING_TERMINAL_WORKTREE_ID,
        openFiles: [archivo({ worktreeId: FLOATING_TERMINAL_WORKTREE_ID })]
      })
    ).toBe('ya-flotante')
  })

  it('refuses every mode that is not a plain file', () => {
    // Un diff o una revisión de conflicto se arma con el estado del proyecto, y el workspace
    // flotante no lo tiene: la pestaña se abriría vacía.
    for (const mode of ['diff', 'conflict-review', 'check-details', 'markdown-preview'] as const) {
      expect(editorDesacoplable({ ...base, openFiles: [archivo({ mode })] })).toBe('no-es-archivo')
    }
  })

  it('refuses an untitled file, which has no path to reopen by', () => {
    expect(editorDesacoplable({ ...base, openFiles: [archivo({ isUntitled: true })] })).toBe(
      'sin-guardar-en-disco'
    )
  })

  it('refuses a file that lives on another machine', () => {
    // El workspace flotante lee siempre en esta máquina, así que la misma ruta sería otro archivo.
    expect(
      editorDesacoplable({ ...base, openFiles: [archivo({ externalSshTargetId: 'ssh-1' })] })
    ).toBe('de-otra-maquina')
    expect(
      editorDesacoplable({ ...base, openFiles: [archivo({ runtimeEnvironmentId: 'env-1' })] })
    ).toBe('de-otra-maquina')
    expect(editorDesacoplable({ ...base, tabExecutionHostId: 'ssh:box' })).toBe('de-otra-maquina')
  })

  it('treats an unknown entity as not a file', () => {
    expect(editorDesacoplable({ ...base, entityId: 'otro' })).toBe('no-es-archivo')
  })
})

describe('desacoplarEditor', () => {
  it('opens in the floating workspace, then closes the original, then shows the panel', () => {
    const orden: string[] = []
    const openFile = vi.fn(() => {
      orden.push('abrir')
      return 'nuevo-id'
    })
    const cerrarPestana = vi.fn(() => orden.push('cerrar'))
    const abrirPanelFlotante = vi.fn(() => orden.push('panel'))

    desacoplarEditor({ archivo: archivo(), openFile, cerrarPestana, abrirPanelFlotante })

    // El orden no es estético: cerrar primero puede descartar el último búfer del archivo, y el
    // editor nuevo leería de disco perdiendo los cambios que el movimiento tenía que llevarse.
    expect(orden).toEqual(['abrir', 'cerrar', 'panel'])
    expect(openFile).toHaveBeenCalledWith(
      {
        filePath: 'D:/repo/src/a.ts',
        relativePath: 'src/a.ts',
        worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
        language: 'typescript',
        mode: 'edit',
        runtimeEnvironmentId: null
      },
      { preview: false, suppressActiveRuntimeFallback: true }
    )
  })
})
