// Elegir el teclado no puede fallar nunca —un perfil viejo no tiene el ajuste— y cambiarlo dos
// veces rápido no puede dejar dos modos montados peleándose por la misma tecla.

import { describe, expect, it, vi } from 'vitest'
import {
  cargarModo,
  keymapDe,
  KEYMAP_POR_DEFECTO,
  montarKeymap,
  necesitaCarga,
  type Modo
} from './keymap-del-editor'

const EDITOR = {} as Parameters<typeof montarKeymap>[0]['editor']

function modoDeMentira(): { modo: Modo; montados: () => number } {
  let montados = 0
  return {
    modo: {
      montar: () => {
        montados += 1
        return () => {
          montados -= 1
        }
      }
    },
    montados: () => montados
  }
}

describe('qué teclado se usa', () => {
  it('el de siempre cuando el ajuste no está', () => {
    expect(keymapDe(undefined)).toBe(KEYMAP_POR_DEFECTO)
    expect(keymapDe(null)).toBe('vscode')
  })

  it('un valor inventado a mano no rompe el editor', () => {
    expect(keymapDe('kakoune')).toBe('vscode')
    expect(keymapDe(7)).toBe('vscode')
  })

  it('los que existen se respetan', () => {
    expect(keymapDe('vim')).toBe('vim')
    expect(keymapDe('emacs')).toBe('emacs')
  })

  it('sólo los que no son el de Monaco cuestan una carga', () => {
    expect(necesitaCarga('vscode')).toBe(false)
    expect(necesitaCarga('vim')).toBe(true)
    expect(necesitaCarga('emacs')).toBe(true)
  })

  it('el de siempre no carga ningún paquete', async () => {
    await expect(cargarModo('vscode')).resolves.toBeNull()
  })
})

describe('montarlo y sacarlo', () => {
  it('monta el modo y devuelve cómo sacarlo', async () => {
    const { modo, montados } = modoDeMentira()
    const soltar = await montarKeymap({
      editor: EDITOR,
      keymap: 'vim',
      barra: null,
      vigente: () => true,
      cargar: async () => modo
    })
    expect(montados()).toBe(1)
    soltar()
    expect(montados()).toBe(0)
  })

  it('soltar dos veces no desmonta dos veces', async () => {
    const soltarModo = vi.fn()
    const soltar = await montarKeymap({
      editor: EDITOR,
      keymap: 'vim',
      barra: null,
      vigente: () => true,
      cargar: async () => ({ montar: () => soltarModo })
    })
    soltar()
    soltar()
    expect(soltarModo).toHaveBeenCalledTimes(1)
  })

  it('si mientras cargaba dejó de hacer falta, no toca el editor', async () => {
    // El caso de verdad: cerrás el archivo —o cambiás de modo otra vez— con el paquete a medio
    // bajar. Sin este guardia quedaban dos teclados montados sobre el mismo editor.
    const { modo, montados } = modoDeMentira()
    const soltar = await montarKeymap({
      editor: EDITOR,
      keymap: 'vim',
      barra: null,
      vigente: () => false,
      cargar: async () => modo
    })
    expect(montados()).toBe(0)
    expect(() => soltar()).not.toThrow()
  })

  it('un paquete que no carga deja el editor andando con el teclado de siempre', async () => {
    const soltar = await montarKeymap({
      editor: EDITOR,
      keymap: 'emacs',
      barra: null,
      vigente: () => true,
      cargar: async () => {
        throw new Error('sin red')
      }
    })
    expect(() => soltar()).not.toThrow()
  })
})
