import { describe, expect, it } from 'vitest'
import {
  applyInterfaceAppearanceStyle,
  interfaceAppearanceStyle,
  selectInterfaceAppearanceSettings
} from './interface-appearance-style'

const claro = { acento: '#ff0000', superficie: '#ffffff', tinta: '#000000', contraste: 0 }
const oscuro = { acento: '#00ff00', superficie: '#000000', tinta: '#ffffff', contraste: 100 }
const temaPropio = { claro, oscuro }

describe('con un tema de plugin pintado (el de la base)', () => {
  it('las perillas se apartan: no pisan nada', () => {
    // Why: son dos temas enteros y mezclarlos daría una paleta que no es ninguna de los dos.
    expect(interfaceAppearanceStyle({ theme: 'light', temaPropio }, false, true)).toBeNull()
  })

  it('sin tema de plugin vuelven las perillas', () => {
    const style = interfaceAppearanceStyle({ theme: 'light', temaPropio }, false, false)

    expect(style?.['--background']).toBe('#ffffff')
  })
})

describe('interface appearance', () => {
  it('selects only theme settings and tolerates older clients', () => {
    expect(
      selectInterfaceAppearanceSettings({ theme: 'light', temaPropio, terminalFontSize: 20 })
    ).toEqual({ theme: 'light', temaPropio })
    expect(selectInterfaceAppearanceSettings(null)).toEqual({
      theme: undefined,
      temaPropio: undefined
    })
    expect(selectInterfaceAppearanceSettings(undefined)).toEqual({
      theme: undefined,
      temaPropio: undefined
    })
  })
  it.each([
    ['light', true, '#ffffff', '#ff0000', '#f5f5f5'],
    ['dark', false, '#000000', '#00ff00', '#242424'],
    ['system', false, '#ffffff', '#ff0000', '#f5f5f5'],
    ['system', true, '#000000', '#00ff00', '#242424']
  ] as const)(
    'resolves %s with system dark %s into shell variables',
    (theme, system, background, primary, card) => {
      const style = interfaceAppearanceStyle({ theme, temaPropio }, system)
      expect(style).toMatchObject({
        '--background': background,
        '--primary': primary,
        '--card': card,
        '--editor-surface': background
      })
      expect(Object.keys(style ?? {})).toHaveLength(18)
      expect(Object.keys(style ?? {}).some((key) => key.startsWith('--color-'))).toBe(false)
    }
  )
  it('returns no overrides for missing, disabled, invalid or missing-scheme settings', () => {
    for (const value of [
      undefined,
      { ...temaPropio, activo: false },
      { claro: { ...claro, tinta: 'invalid' } },
      { oscuro }
    ]) {
      expect(interfaceAppearanceStyle({ theme: 'light', temaPropio: value }, true)).toBeNull()
    }
  })
  it('restores prior inline values and priorities without touching unrelated tokens', () => {
    const values = new Map([
      ['--background', ['original', 'important']],
      ['--app-font-family', ['Geist', '']]
    ])
    const style = {
      getPropertyValue: (key: string) => values.get(key)?.[0] ?? '',
      getPropertyPriority: (key: string) => values.get(key)?.[1] ?? '',
      setProperty: (key: string, value: string, priority = '') => {
        values.set(key, [value, priority])
      },
      removeProperty: (key: string) => {
        const old = values.get(key)?.[0] ?? ''
        values.delete(key)
        return old
      }
    }
    const cleanup = applyInterfaceAppearanceStyle(style, {
      '--background': '#ffffff',
      '--primary': '#ff0000'
    })
    expect(values.get('--background')).toEqual(['#ffffff', ''])
    expect(values.get('--primary')).toEqual(['#ff0000', ''])
    cleanup()
    expect([...values]).toEqual([
      ['--background', ['original', 'important']],
      ['--app-font-family', ['Geist', '']]
    ])
    applyInterfaceAppearanceStyle(style, null)()
    expect([...values]).toHaveLength(2)
  })
})
