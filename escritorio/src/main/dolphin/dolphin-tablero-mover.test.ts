import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ConsolaDeDolphin from './dolphin-console'

const { ensureConsole } = vi.hoisted(() => ({
  ensureConsole: vi.fn(async () => ({ url: 'http://127.0.0.1:4100', token: 'pase' }))
}))
vi.mock('./dolphin-console', async (importOriginal) => ({
  ...(await importOriginal<typeof ConsolaDeDolphin>()),
  ensureConsole
}))

import { DolphinFailure } from './dolphin-console'
import {
  ARRANQUE_PARA_MOVER_MS,
  consolaDeVerdad,
  moverTarjetaDelTablero,
  type ConsolaParaMover
} from './dolphin-tablero-mover'

function consolaQueContesta(
  respuesta: Response
): ConsolaParaMover & { pedir: ReturnType<typeof vi.fn> } {
  return {
    abrir: async () => ({ url: 'http://127.0.0.1:4100', token: 'pase' }),
    pedir: vi.fn(async () => respuesta)
  }
}

function consolaQueNoArranca(error: unknown): ConsolaParaMover & {
  pedir: ReturnType<typeof vi.fn>
} {
  return {
    abrir: async () => {
      throw error
    },
    pedir: vi.fn(async (): Promise<Response> => {
      throw new Error('no se pide nada si la consola no arrancó')
    })
  }
}

beforeEach(() => ensureConsole.mockClear())

describe('moverTarjetaDelTablero', () => {
  it('le pide a la consola del repo que la mueva, con el pase', async () => {
    const consola = consolaQueContesta(new Response('{"ok":true}', { status: 200 }))
    expect(await moverTarjetaDelTablero('/repo', 't-1 a', 'para-hacer', consola)).toEqual({
      ok: true
    })
    expect(consola.pedir).toHaveBeenCalledWith(
      'http://127.0.0.1:4100/api/tablero/t-1%20a/mover',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-dolphin-token': 'pase' }),
        body: JSON.stringify({ columna: 'para-hacer' })
      })
    )
  })

  it('devuelve el porqué del núcleo como `rejected` cuando no la mueve', async () => {
    const consola = consolaQueContesta(
      new Response(JSON.stringify({ ok: false, porQue: 'no hay una tarjeta «x»' }), { status: 400 })
    )
    expect(await moverTarjetaDelTablero('/repo', 'x', 'hecho', consola)).toEqual({
      ok: false,
      code: 'rejected',
      detail: 'no hay una tarjeta «x»'
    })
  })

  it('una consola que no arranca a tiempo es `timeout` con los segundos aparte, no «20» a secas', async () => {
    const consola = consolaQueNoArranca(new DolphinFailure('timeout', '60'))
    expect(await moverTarjetaDelTablero('/repo', 'x', 'hecho', consola)).toEqual({
      ok: false,
      code: 'timeout',
      detail: '60'
    })
    expect(consola.pedir).not.toHaveBeenCalled()
  })

  it('cualquier otro error es un no con código y detalle, no una excepción', async () => {
    const consola = consolaQueNoArranca(new Error('sin node'))
    expect(await moverTarjetaDelTablero('/repo', 'x', 'hecho', consola)).toEqual({
      ok: false,
      code: 'unreachable',
      detail: 'sin node'
    })
  })
})

describe('consolaDeVerdad', () => {
  it('para mover le da a la consola 60 s para arrancar, no los 20 de siempre', async () => {
    await consolaDeVerdad({ appPath: '/app' }).abrir('/repo')
    expect(ARRANQUE_PARA_MOVER_MS).toBe(60_000)
    expect(ensureConsole).toHaveBeenCalledWith('/repo', { appPath: '/app', timeoutMs: 60_000 })
  })

  it('un tope pedido a mano manda sobre el de mover', async () => {
    await consolaDeVerdad({ appPath: '/app', timeoutMs: 5_000 }).abrir('/repo')
    expect(ensureConsole).toHaveBeenCalledWith('/repo', { appPath: '/app', timeoutMs: 5_000 })
  })
})
