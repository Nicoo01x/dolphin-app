import { describe, expect, it } from 'vitest'
import { accionDelAcorde, esSoloModificador } from './acordes-de-ctrl-k'
import { crearAvisoDeFoco } from './aviso-de-foco-del-editor'

function tecla(code: string, mods: Partial<Record<'ctrl' | 'meta' | 'alt' | 'shift', boolean>>) {
  return {
    code,
    ctrlKey: Boolean(mods.ctrl),
    metaKey: Boolean(mods.meta),
    altKey: Boolean(mods.alt),
    shiftKey: Boolean(mods.shift)
  }
}

describe('accionDelAcorde', () => {
  it('Ctrl+K Ctrl+C comenta y Ctrl+K Ctrl+U descomenta, como en Monaco', () => {
    expect(accionDelAcorde(tecla('KeyC', { ctrl: true }), false)).toBe(
      'editor.action.addCommentLine'
    )
    expect(accionDelAcorde(tecla('KeyU', { ctrl: true }), false)).toBe(
      'editor.action.removeCommentLine'
    )
  })

  it('en macOS el modificador del acorde es Cmd', () => {
    expect(accionDelAcorde(tecla('Digit0', { meta: true }), true)).toBe('editor.foldAll')
    expect(accionDelAcorde(tecla('Digit0', { ctrl: true }), true)).toBeNull()
  })

  it('distingue Shift (plegar recursivo) y los niveles de plegado', () => {
    expect(accionDelAcorde(tecla('KeyL', { ctrl: true }), false)).toBe('editor.toggleFold')
    expect(accionDelAcorde(tecla('KeyL', { ctrl: true, shift: true }), false)).toBe(
      'editor.toggleFoldRecursively'
    )
    expect(accionDelAcorde(tecla('Digit3', { ctrl: true }), false)).toBe('editor.foldLevel3')
  })

  it('una letra suelta es el principio del pedido, no un acorde', () => {
    expect(accionDelAcorde(tecla('KeyC', {}), false)).toBeNull()
    expect(accionDelAcorde(tecla('KeyH', { shift: true }), false)).toBeNull()
  })

  it('Ctrl+V (pegar el pedido) y Ctrl+K otra vez no cierran el cuadrito', () => {
    expect(accionDelAcorde(tecla('KeyV', { ctrl: true }), false)).toBeNull()
    expect(accionDelAcorde(tecla('KeyK', { ctrl: true }), false)).toBeNull()
  })

  it('soltar o seguir apretando Ctrl todavía no decide nada', () => {
    expect(esSoloModificador({ code: 'ControlLeft' })).toBe(true)
    expect(esSoloModificador({ code: 'KeyC' })).toBe(false)
  })
})

describe('crearAvisoDeFoco', () => {
  it('pasar de un split al otro no deja al proceso principal con un «no»', () => {
    const enviados: boolean[] = []
    const aviso = crearAvisoDeFoco((hay) => enviados.push(hay))
    aviso.marcar('a', true)
    // Monaco avisa el foco del nuevo antes que la pérdida del viejo.
    aviso.marcar('b', true)
    aviso.marcar('a', false)
    expect(enviados).toEqual([true])
    aviso.marcar('b', false)
    expect(enviados).toEqual([true, false])
  })
})
