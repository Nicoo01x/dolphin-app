import { describe, expect, it } from 'vitest'
import { resultadoDeComando } from './resultado-de-comando'

describe('resultadoDeComando', () => {
  it('lee los conteos de vitest', () => {
    expect(resultadoDeComando(' Tests  1 failed | 11 passed (12)', 1, true)).toEqual({
      fallo: true,
      detalle: { tipo: 'fallaron', n: 1 }
    })
    expect(resultadoDeComando(' Tests  12 passed (12)', 0, false)).toEqual({
      fallo: false,
      detalle: { tipo: 'pasaron', n: 12 }
    })
  })

  it('lee jest, pytest y cargo', () => {
    expect(resultadoDeComando('Tests: 2 failed, 3 passed, 5 total', 1, true).detalle).toEqual({
      tipo: 'fallaron',
      n: 2
    })
    expect(resultadoDeComando('==== 1 passed in 0.12s ====', 0, false).detalle).toEqual({
      tipo: 'pasaron',
      n: 1
    })
    expect(
      resultadoDeComando('test result: FAILED. 4 passed; 1 failed; 0 ignored', 101, true).detalle
    ).toEqual({ tipo: 'fallaron', n: 1 })
  })

  it('sin conteo, dice el código con que salió y no inventa más', () => {
    expect(resultadoDeComando('error TS2322', 2, true)).toEqual({
      fallo: true,
      detalle: { tipo: 'codigo', n: 2 }
    })
    expect(resultadoDeComando('boom', undefined, true)).toEqual({
      fallo: true,
      detalle: { tipo: 'fallo' }
    })
    expect(resultadoDeComando('built in 3s', 0, false)).toEqual({ fallo: false, detalle: null })
  })
})
