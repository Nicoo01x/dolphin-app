import { describe, expect, it } from 'vitest'
import { nextPortonState, type DolphinPortonState } from './use-dolphin-porton'

/** Lo que el pie del portón sabe después de cada respuesta de la consola. */

const running: DolphinPortonState = {
  running: true,
  starting: false,
  run: { desde: 'antes', fases: [{ nombre: 'test', estado: 'corriendo' }] },
  interrupted: false,
  failure: null
}

describe('the studio porton state', () => {
  it('a console that stops answering mid-run leaves the run as far as it got, marked as cut', () => {
    const next = nextPortonState(running, { ok: false, code: 'unreachable', detail: 'se cerró' })
    expect(next).toMatchObject({
      running: false,
      interrupted: true,
      run: running.run,
      failure: { code: 'unreachable', detail: 'se cerró' }
    })
  })

  it('a fresh console that knows no run does not wipe the one that was running', () => {
    const next = nextPortonState(running, { ok: true, corriendo: false, pasada: null })
    expect(next).toMatchObject({ running: false, interrupted: true, run: running.run })
  })

  it('a run that ends replaces what was known, with no leftovers', () => {
    const done = {
      desde: 'antes',
      hasta: 'después',
      fases: [{ nombre: 'test', estado: 'paso' as const }]
    }
    expect(nextPortonState(running, { ok: true, corriendo: false, pasada: done })).toEqual({
      running: false,
      starting: false,
      run: done,
      interrupted: false,
      failure: null
    })
  })

  it('a failure before anything ran is just a failure, not a cut run', () => {
    const idle: DolphinPortonState = { ...running, running: false, run: null }
    expect(nextPortonState(idle, { ok: false, code: 'not-found' })).toMatchObject({
      interrupted: false,
      failure: { code: 'not-found' }
    })
  })
})
