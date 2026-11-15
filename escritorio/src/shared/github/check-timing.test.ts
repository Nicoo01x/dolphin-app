import { describe, expect, it } from 'vitest'
import { checkTiming } from './check-timing'

const AHORA = Date.parse('2026-11-10T12:00:00Z')
const seg = (n: number): number => n * 1000

describe('los tiempos de un check', () => {
  it('con principio y fin da lo que duró y hace cuánto terminó', () => {
    const timing = checkTiming(
      { startedAt: '2026-11-10T11:50:00Z', completedAt: '2026-11-10T11:53:12Z' },
      AHORA
    )

    expect(timing).toEqual({ duracionMs: seg(192), desdeElFinalMs: seg(408) })
  })

  it('mientras corre, la duración es lo que lleva andando y no hay «hace»', () => {
    const timing = checkTiming({ startedAt: '2026-11-10T11:48:00Z' }, AHORA)

    expect(timing).toEqual({ duracionMs: seg(720), desdeElFinalMs: null })
  })

  it('con fin pero sin principio dice cuándo terminó y no inventa la duración', () => {
    // Un status de los viejos (Jenkins, Prow) trae una fecha sola: se dice lo que se sabe.
    const timing = checkTiming({ completedAt: '2026-11-10T11:30:00Z' }, AHORA)

    expect(timing).toEqual({ duracionMs: null, desdeElFinalMs: seg(1800) })
  })

  it('sin ningún tiempo no hay nada que mostrar', () => {
    // Why null y no ceros: la fila no dibuja un espacio reservado para un dato que no existe.
    expect(checkTiming({}, AHORA)).toBeNull()
    expect(checkTiming({ startedAt: null, completedAt: null }, AHORA)).toBeNull()
  })

  it('descarta una fecha que no es una fecha', () => {
    expect(checkTiming({ startedAt: 'done', completedAt: '' }, AHORA)).toBeNull()
    expect(checkTiming({ startedAt: 'ayer', completedAt: '2026-11-10T11:59:00Z' }, AHORA)).toEqual({
      duracionMs: null,
      desdeElFinalMs: seg(60)
    })
  })

  it('no cuenta para atrás cuando el host viene adelantado', () => {
    // Why: los relojes del host y de esta máquina no son el mismo. Un check recién terminado
    // puede venir fechado unos segundos en el futuro, y «hace -3s» no explica nada.
    const timing = checkTiming(
      { startedAt: '2026-11-10T12:00:05Z', completedAt: '2026-11-10T12:00:03Z' },
      AHORA
    )

    expect(timing).toEqual({ duracionMs: 0, desdeElFinalMs: 0 })
  })
})
