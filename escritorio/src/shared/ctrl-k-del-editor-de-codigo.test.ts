import { describe, expect, it } from 'vitest'
import { editorDeCodigoReclamaCtrlK } from './ctrl-k-del-editor-de-codigo'
import { getLegacySearchBindings } from './keybindings/definitions'
import { resolveWindowShortcutAction } from './window-shortcut-policy'

const ctrlK = { type: 'keyDown', key: 'k', code: 'KeyK', control: true }
const cmdK = { type: 'keyDown', key: 'k', code: 'KeyK', meta: true }

describe('editorDeCodigoReclamaCtrlK', () => {
  it('con un perfil nuevo, la paleta de worktrees está en Ctrl+K y el editor se la queda', () => {
    // El bug: sin esta excepción el proceso principal resolvía la paleta y Monaco no se enteraba.
    expect(resolveWindowShortcutAction(ctrlK, 'win32', undefined, { context: 'app' })).toEqual({
      type: 'toggleWorktreePalette'
    })
    expect(
      editorDeCodigoReclamaCtrlK({
        input: ctrlK,
        platform: 'win32',
        keybindings: undefined,
        editorEnfocado: true
      })
    ).toBe(true)
  })

  it('en macOS la tecla es Cmd+K', () => {
    const args = { platform: 'darwin' as const, keybindings: {}, editorEnfocado: true }
    expect(editorDeCodigoReclamaCtrlK({ ...args, input: cmdK })).toBe(true)
    expect(editorDeCodigoReclamaCtrlK({ ...args, input: ctrlK })).toBe(false)
  })

  it('fuera del editor de código, Ctrl+K sigue siendo lo de la base', () => {
    expect(
      editorDeCodigoReclamaCtrlK({
        input: ctrlK,
        platform: 'win32',
        keybindings: undefined,
        editorEnfocado: false
      })
    ).toBe(false)
  })

  it('no toca las variantes con otro modificador', () => {
    const base = { platform: 'win32' as const, keybindings: undefined, editorEnfocado: true }
    expect(editorDeCodigoReclamaCtrlK({ ...base, input: { ...ctrlK, shift: true } })).toBe(false)
    expect(editorDeCodigoReclamaCtrlK({ ...base, input: { ...ctrlK, alt: true } })).toBe(false)
    expect(editorDeCodigoReclamaCtrlK({ ...base, input: { ...ctrlK, meta: true } })).toBe(false)
    expect(editorDeCodigoReclamaCtrlK({ ...base, input: { ...ctrlK, key: 'j' } })).toBe(false)
  })

  it('si la persona puso a mano una acción global en Ctrl+K, manda su elección', () => {
    // La paleta en Ctrl+K y otra tecla más ya no es lo de fábrica: es una elección.
    expect(
      editorDeCodigoReclamaCtrlK({
        input: ctrlK,
        platform: 'win32',
        keybindings: { 'worktree.palette': ['Mod+K', 'Mod+Shift+P'] },
        editorEnfocado: true
      })
    ).toBe(false)
  })

  it('después de «Restablecer», el Mod+K que la base deja escrito cuenta como de fábrica', () => {
    // El bug: el archivo quedaba con `worktree.palette: ["Mod+K"]` y eso se leía como una
    // elección, así que Ctrl+K en el editor abría la paleta en vez del cuadrito.
    for (const [platform, input] of [
      ['win32', ctrlK],
      ['linux', ctrlK],
      ['darwin', cmdK]
    ] as const) {
      expect(
        editorDeCodigoReclamaCtrlK({
          input,
          platform,
          keybindings: { 'worktree.palette': ['Mod+K'] },
          editorEnfocado: true
        })
      ).toBe(true)
    }
  })

  it('si la persona sacó la paleta de Ctrl+K, no hay nada que reclamar', () => {
    expect(
      editorDeCodigoReclamaCtrlK({
        input: ctrlK,
        platform: 'win32',
        keybindings: { 'worktree.palette': ['Mod+Shift+P'] },
        editorEnfocado: true
      })
    ).toBe(false)
  })

  it('en la cohorte vieja el proceso principal no tiene nada en Ctrl+K', () => {
    const keybindings = getLegacySearchBindings('win32')
    expect(resolveWindowShortcutAction(ctrlK, 'win32', keybindings, { context: 'app' })).toBeNull()
    expect(
      editorDeCodigoReclamaCtrlK({
        input: ctrlK,
        platform: 'win32',
        keybindings,
        editorEnfocado: true
      })
    ).toBe(false)
  })
})
