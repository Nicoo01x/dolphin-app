// Revertir un pedazo tiene que dejar EXACTAMENTE los otros cambios como estaban. Cada caso de
// acá es una forma de perder trabajo: revertir de más, revertir el de al lado, o comerse el
// salto final y que git muestre el archivo entero como cambiado.

import { describe, expect, it } from 'vitest'
import { hunkEnLaLinea, hunksDe, lineasDe, revertirHunk } from './bordes-de-git'

const HEAD = 'uno\ndos\ntres\ncuatro\n'

describe('las líneas de un texto', () => {
  it('el salto final no inventa una línea vacía', () => {
    expect(lineasDe('a\nb\n')).toEqual(['a', 'b'])
    expect(lineasDe('a\nb')).toEqual(['a', 'b'])
    expect(lineasDe('')).toEqual([])
  })
})

describe('los pedazos cambiados', () => {
  it('sin cambios no hay ninguno', () => {
    expect(hunksDe(HEAD, HEAD)).toEqual([])
  })

  it('una línea agregada en el medio', () => {
    const hunks = hunksDe(HEAD, 'uno\ndos\nNUEVA\ntres\ncuatro\n')
    expect(hunks).toEqual([{ tipo: 'agregado', desde: 3, hasta: 3, original: [] }])
  })

  it('una línea cambiada es UN pedazo, no un borrado más un agregado', () => {
    const hunks = hunksDe(HEAD, 'uno\nDOS\ntres\ncuatro\n')
    expect(hunks).toEqual([{ tipo: 'cambiado', desde: 2, hasta: 2, original: ['dos'] }])
  })

  it('una línea borrada marca el corte y no ocupa ninguna línea', () => {
    const hunks = hunksDe(HEAD, 'uno\ntres\ncuatro\n')
    expect(hunks).toEqual([{ tipo: 'borrado', desde: 2, hasta: 1, original: ['dos'] }])
  })

  it('dos cambios separados son dos pedazos, con sus líneas bien contadas', () => {
    const hunks = hunksDe(HEAD, 'UNO\ndos\ntres\nCUATRO\n')
    expect(hunks).toEqual([
      { tipo: 'cambiado', desde: 1, hasta: 1, original: ['uno'] },
      { tipo: 'cambiado', desde: 4, hasta: 4, original: ['cuatro'] }
    ])
  })

  it('un archivo nuevo entero es un solo agregado', () => {
    expect(hunksDe('', 'a\nb\n')).toEqual([{ tipo: 'agregado', desde: 1, hasta: 2, original: [] }])
  })
})

describe('revertir un pedazo', () => {
  it('devuelve ese pedazo y deja los otros cambios intactos', () => {
    const actual = 'UNO\ndos\ntres\nCUATRO\n'
    const hunks = hunksDe(HEAD, actual)
    const primero = hunks[0]
    expect(primero).toBeDefined()
    expect(revertirHunk(actual, primero!)).toBe('uno\ndos\ntres\nCUATRO\n')
  })

  it('revertir un agregado saca las líneas que se habían puesto', () => {
    const actual = 'uno\ndos\nNUEVA\ntres\ncuatro\n'
    const hunks = hunksDe(HEAD, actual)
    expect(revertirHunk(actual, hunks[0]!)).toBe(HEAD)
  })

  it('revertir un borrado repone lo que se había ido', () => {
    const actual = 'uno\ntres\ncuatro\n'
    const hunks = hunksDe(HEAD, actual)
    expect(revertirHunk(actual, hunks[0]!)).toBe(HEAD)
  })

  it('revertir los dos pedazos, uno tras otro, vuelve a HEAD', () => {
    let actual = 'UNO\ndos\nTRES\ncuatro\n'
    for (let vuelta = 0; vuelta < 5; vuelta += 1) {
      const hunks = hunksDe(HEAD, actual)
      if (hunks.length === 0) {
        break
      }
      actual = revertirHunk(actual, hunks[0]!)
    }
    expect(actual).toBe(HEAD)
  })

  it('un archivo sin salto final sigue sin salto final', () => {
    const actual = 'uno\nDOS'
    const hunks = hunksDe('uno\ndos', actual)
    expect(revertirHunk(actual, hunks[0]!)).toBe('uno\ndos')
  })

  it('revertir una línea escrita en la vacía del final devuelve el salto final', () => {
    // En Monaco, «la línea vacía del final» es lo que sigue al último salto: escribir ahí se come
    // el salto. Revertir tiene que dejar el archivo igual a HEAD, no con una línea cambiada más.
    const actual = 'uno\ndos\ntres\ncuatro\n + 0'
    const hunks = hunksDe(HEAD, actual)
    expect(hunks).toHaveLength(1)
    const revertido = revertirHunk(actual, hunks[0]!, HEAD)
    expect(revertido).toBe(HEAD)
    expect(hunksDe(HEAD, revertido)).toEqual([])
  })

  it('revertir el final de un archivo sin salto final no le agrega uno', () => {
    const base = 'uno\ndos'
    const actual = 'uno\ndos\ntres\n'
    const hunks = hunksDe(base, actual)
    expect(revertirHunk(actual, hunks.at(-1)!, base)).toBe(base)
  })

  it('un hunk fuera del archivo se rechaza en vez de escribir cualquier cosa', () => {
    expect(() =>
      revertirHunk('a\n', { tipo: 'cambiado', desde: 99, hasta: 99, original: ['x'] })
    ).toThrow(RangeError)
  })
})

// Git for Windows trae `core.autocrlf=true`: HEAD guarda `\n` y el archivo en disco tiene `\r\n`.
describe('un archivo CRLF contra un HEAD LF', () => {
  const HEAD_CRLF = HEAD.replace(/\n/g, '\r\n')

  it('sin cambios no marca nada, aunque cada línea difiera en su \\r', () => {
    expect(hunksDe(HEAD, HEAD_CRLF)).toEqual([])
  })

  it('un cambio marca sólo su línea', () => {
    expect(hunksDe(HEAD, 'uno\r\nDOS\r\ntres\r\ncuatro\r\n')).toEqual([
      { tipo: 'cambiado', desde: 2, hasta: 2, original: ['dos'] }
    ])
  })

  it('revertir trae ese pedazo y no el archivo entero, con los fines de línea del documento', () => {
    const actual = 'UNO\r\ndos\r\ntres\r\nCUATRO\r\n'
    const hunks = hunksDe(HEAD, actual)
    expect(hunks).toHaveLength(2)
    const revertido = revertirHunk(actual, hunks[0]!, HEAD)
    expect(revertido).toBe('uno\r\ndos\r\ntres\r\nCUATRO\r\n')
    // Ni un `\n` suelto adentro de un archivo CRLF.
    expect(revertido.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('revertir el final de un archivo CRLF deja su salto final en CRLF', () => {
    const actual = `${HEAD_CRLF} + 0`
    const hunks = hunksDe(HEAD, actual)
    expect(revertirHunk(actual, hunks[0]!, HEAD)).toBe(HEAD_CRLF)
  })
})

describe('qué pedazo toca una línea', () => {
  it('una línea adentro del pedazo lo encuentra', () => {
    const hunks = hunksDe(HEAD, 'uno\ndos\nA\nB\ntres\ncuatro\n')
    expect(hunkEnLaLinea(hunks, 4)?.tipo).toBe('agregado')
    expect(hunkEnLaLinea(hunks, 1)).toBeNull()
  })

  it('un borrado se agarra desde la línea de arriba o la de abajo del corte', () => {
    const hunks = hunksDe(HEAD, 'uno\ntres\ncuatro\n')
    expect(hunkEnLaLinea(hunks, 1)?.tipo).toBe('borrado')
    expect(hunkEnLaLinea(hunks, 2)?.tipo).toBe('borrado')
    expect(hunkEnLaLinea(hunks, 3)).toBeNull()
  })
})
