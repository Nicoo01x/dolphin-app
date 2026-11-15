import { beforeEach, describe, expect, it, vi } from 'vitest'

const abrirParaLink = vi.fn()
const programarSalto = vi.fn()

vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ openFileForLink: abrirParaLink }) }
}))
vi.mock('@/store/slices/editor/focus/editor-focus-reveal', () => ({
  scheduleEditorLineReveal: (...args: unknown[]) => programarSalto(...args)
}))

import { crearAbrirUbicacion } from './abrir-ubicacion-del-editor'

describe('ir a la definición en otro archivo', () => {
  beforeEach(() => {
    abrirParaLink.mockReset()
    programarSalto.mockReset()
  })

  it('el salto a la línea queda atado a la vista que se abrió, no a cualquiera del archivo', () => {
    // El bug: con el editor dividido y b.ts abierto en el otro panel, el salto iba sólo por
    // archivo y lo tomaba el editor del otro panel; la pestaña nueva quedaba en la línea 1.
    abrirParaLink.mockImplementation((_archivo, _opciones, _intencion, alMostrarse) => {
      alMostrarse({ fileId: '/repo/src/b.ts', viewStateId: 'pestana-nueva-en-A', groupId: 'A' })
      return null
    })
    const abrir = crearAbrirUbicacion('wt-1', '/repo')

    expect(abrir('/repo/src/b.ts', 9, 17)).toBe(true)

    expect(abrirParaLink).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: 'src/b.ts', worktreeId: 'wt-1', mode: 'edit' }),
      undefined,
      // Sin intención de link: se abre donde abre openFile, en el grupo activo.
      null,
      expect.any(Function)
    )
    expect(programarSalto).toHaveBeenCalledWith(
      expect.any(Function),
      expect.stringContaining('b.ts'),
      9,
      17,
      '/repo/src/b.ts',
      { viewStateId: 'pestana-nueva-en-A' }
    )
  })

  it('si no se pudo mostrar ninguna vista, no salta a ningún lado', () => {
    abrirParaLink.mockImplementation((_archivo, _opciones, _intencion, alMostrarse) => {
      alMostrarse(null)
      return null
    })
    crearAbrirUbicacion('wt-1', '/repo')('/repo/src/b.ts', 9, 1)
    expect(programarSalto).not.toHaveBeenCalled()
  })

  it('un archivo de afuera del worktree no se abre desde acá', () => {
    expect(crearAbrirUbicacion('wt-1', '/repo')('/otro/lib.d.ts', 1, 1)).toBe(false)
    expect(abrirParaLink).not.toHaveBeenCalled()
  })
})
