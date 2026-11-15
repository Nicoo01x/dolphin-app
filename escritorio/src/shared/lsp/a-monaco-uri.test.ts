import { describe, expect, it } from 'vitest'
import {
  mismaRuta,
  rangoAMonaco,
  rangoDesdeMonaco,
  rutaDeUri,
  severidadAMonaco,
  severidadDesdeMonaco,
  uriDeArchivo
} from './a-monaco'

describe('uriDeArchivo, el único lugar que arma el uri', () => {
  it('Windows: letra de unidad, espacios y tildes', () => {
    const ruta = 'D:\\Proyectos\\mi app\\canción.ts'
    expect(uriDeArchivo(ruta)).toBe('file:///D%3A/Proyectos/mi%20app/canci%C3%B3n.ts')
    // El bug: las preguntas salían con este otro uri y el servidor no conocía el documento.
    expect(uriDeArchivo(ruta)).not.toBe(`file://${ruta.replace(/\\/g, '/')}`)
    expect(rutaDeUri(uriDeArchivo(ruta))).toBe('D:/Proyectos/mi app/canción.ts')
  })

  it('Linux y macOS', () => {
    expect(uriDeArchivo('/home/nico/proyecto/a b.ts')).toBe('file:///home/nico/proyecto/a%20b.ts')
    expect(uriDeArchivo('/Users/nico/Código/índice.ts')).toBe(
      'file:///Users/nico/C%C3%B3digo/%C3%ADndice.ts'
    )
    expect(rutaDeUri(uriDeArchivo('/Users/nico/Código/índice.ts'))).toBe(
      '/Users/nico/Código/índice.ts'
    )
  })
})

describe('mismaRuta', () => {
  it('reconoce el uri que devuelve el servidor con la unidad en minúscula', () => {
    expect(mismaRuta(rutaDeUri('file:///d%3A/Proyectos/a.ts'), 'D:\\Proyectos\\a.ts')).toBe(true)
    expect(mismaRuta('/D:/Proyectos/a.ts', 'D:/Proyectos/a.ts')).toBe(true)
  })

  it('en posix el resto de la ruta distingue mayúsculas', () => {
    expect(mismaRuta('/repo/A.ts', '/repo/a.ts')).toBe(false)
    expect(mismaRuta('/repo/a.ts', '/repo/a.ts')).toBe(true)
  })
})

describe('de Monaco a LSP', () => {
  it('el rango va y vuelve', () => {
    const lsp = { start: { line: 0, character: 4 }, end: { line: 2, character: 0 } }
    expect(rangoDesdeMonaco(rangoAMonaco(lsp))).toEqual(lsp)
  })

  it('la severidad va y vuelve', () => {
    for (const severidad of [1, 2, 3, 4]) {
      expect(severidadDesdeMonaco(severidadAMonaco(severidad))).toBe(severidad)
    }
  })
})
