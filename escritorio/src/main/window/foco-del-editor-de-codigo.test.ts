import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CANAL_FOCO_DEL_EDITOR_DE_CODIGO } from '../../shared/canal-foco-del-editor-de-codigo'

const { ipc } = vi.hoisted(() => {
  // Lo justo de ipcMain: `on`, `removeListener` y una forma de emitir desde el test.
  type Oyente = (...args: unknown[]) => void
  const oyentes = new Map<string, Oyente[]>()
  return {
    ipc: {
      on: (canal: string, oyente: Oyente) => {
        oyentes.set(canal, [...(oyentes.get(canal) ?? []), oyente])
      },
      removeListener: (canal: string, oyente: Oyente) => {
        oyentes.set(
          canal,
          (oyentes.get(canal) ?? []).filter((otro) => otro !== oyente)
        )
      },
      emit: (canal: string, ...args: unknown[]) => {
        for (const oyente of oyentes.get(canal) ?? []) {
          oyente(...args)
        }
      },
      listenerCount: (canal: string) => (oyentes.get(canal) ?? []).length,
      removeAllListeners: () => oyentes.clear()
    }
  }
})

vi.mock('electron', () => ({ ipcMain: ipc }))

import { instalarFocoDelEditorDeCodigo } from './foco-del-editor-de-codigo'

function webContentsFalso(): object {
  return {}
}

function avisar(sender: unknown, valor: unknown): void {
  ipc.emit(CANAL_FOCO_DEL_EDITOR_DE_CODIGO, { sender }, valor)
}

describe('instalarFocoDelEditorDeCodigo', () => {
  beforeEach(() => {
    ipc.removeAllListeners()
  })

  it('refleja lo que avisa el renderer de su ventana', () => {
    const wc = webContentsFalso()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: un webContents de mentira: el espejo sólo lo compara por identidad.
    const foco = instalarFocoDelEditorDeCodigo(wc as unknown as Electron.WebContents)
    expect(foco.estaEnfocado()).toBe(false)
    avisar(wc, true)
    expect(foco.estaEnfocado()).toBe(true)
    avisar(wc, false)
    expect(foco.estaEnfocado()).toBe(false)
  })

  it('ignora a otro remitente y a cualquier cosa que no sea true', () => {
    const wc = webContentsFalso()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: un webContents de mentira: el espejo sólo lo compara por identidad.
    const foco = instalarFocoDelEditorDeCodigo(wc as unknown as Electron.WebContents)
    avisar(webContentsFalso(), true)
    expect(foco.estaEnfocado()).toBe(false)
    avisar(wc, 'true')
    expect(foco.estaEnfocado()).toBe(false)
  })

  it('dispose suelta el canal', () => {
    const wc = webContentsFalso()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: un webContents de mentira: el espejo sólo lo compara por identidad.
    const foco = instalarFocoDelEditorDeCodigo(wc as unknown as Electron.WebContents)
    foco.dispose()
    expect(ipc.listenerCount(CANAL_FOCO_DEL_EDITOR_DE_CODIGO)).toBe(0)
    avisar(wc, true)
    expect(foco.estaEnfocado()).toBe(false)
  })
})
