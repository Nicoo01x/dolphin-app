import { describe, expect, it } from 'vitest'
import type { RateLimitState } from '../../shared/rate-limit-types'
import { planUsoDe, publicarPlanUso } from './dolphin-plan-uso'

const vacio = {
  claude: null,
  codex: null,
  gemini: null,
  opencodeGo: null,
  kimi: null,
  antigravity: null,
  minimax: null,
  grok: null
} as unknown as RateLimitState

describe('el uso del plan para el autopiloto', () => {
  it('sin datos no hay archivo', () => {
    expect(planUsoDe(vacio)).toBeNull()
  })

  it('cada ventana del agente con su porcentaje y cuándo reinicia', () => {
    const state = {
      ...vacio,
      claude: {
        session: {
          usedPercent: 12.4,
          windowMinutes: 300,
          resetsAt: Date.UTC(2026, 9, 26, 7),
          resetDescription: null
        },
        weekly: { usedPercent: 93, windowMinutes: 10080, resetsAt: null, resetDescription: 'Thu' }
      }
    } as unknown as RateLimitState
    const uso = planUsoDe(state, new Date(Date.UTC(2026, 9, 26, 5)))
    expect(uso).toEqual({
      escritoEn: '2026-10-26T05:00:00.000Z',
      agentes: [
        {
          agente: 'claude',
          ventanas: [
            { nombre: '5h', usadoPct: 12, reiniciaEn: '2026-10-26T07:00:00.000Z' },
            { nombre: 'semana', usadoPct: 93, reiniciaEn: null }
          ]
        }
      ]
    })
  })

  it('en los tests no escribe nada', () => {
    let suscripto = false
    publicarPlanUso(
      () => {
        suscripto = true
        return () => undefined
      },
      { VITEST: 'true' }
    )
    expect(suscripto).toBe(false)
  })
})
