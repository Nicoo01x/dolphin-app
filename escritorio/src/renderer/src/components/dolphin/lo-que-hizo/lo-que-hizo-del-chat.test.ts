import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import { datosDelTurno, turnosDe } from './lo-que-hizo-del-chat'
import { datosDelUltimoTurno, ultimaSesionDe } from './BotonLoQueHizoDelTablero'

const T0 = Date.UTC(2026, 10, 14, 15, 0, 0)

function m(
  id: string,
  role: NativeChatMessage['role'],
  segundo: number,
  blocks: NativeChatMessage['blocks']
): NativeChatMessage {
  return { id, role, blocks, timestamp: T0 + segundo * 1000, source: 'transcript' }
}

// Como lo escribe Claude en su transcript: el resultado de cada herramienta llega como mensaje de
// la persona, y no abre un turno nuevo.
const SESION: NativeChatMessage[] = [
  m('u1', 'user', 0, [{ type: 'text', text: 'Corré los tests de precios' }]),
  m('a1', 'assistant', 3, [
    { type: 'tool-call', name: 'Bash', callId: 'c1', input: { command: 'pnpm test pricing' } }
  ]),
  m('r1', 'user', 9, [{ type: 'tool-result', callId: 'c1', output: ' Tests  12 passed (12)' }]),
  m('a2', 'assistant', 10, [{ type: 'text', text: 'Pasaron los doce.' }]),
  m('u2', 'user', 60, [{ type: 'text', text: 'Gracias' }]),
  m('a3', 'assistant', 62, [{ type: 'text', text: 'De nada.' }])
]

describe('turnosDe', () => {
  it('un resultado de herramienta no abre un turno', () => {
    const { turnKeys } = turnosDe('claude', SESION)
    expect(turnKeys).toEqual(['u1', 'u1', 'u1', 'u1', 'u2', 'u2'])
  })

  it('la respuesta final de un turno con pasos tiene su tarjeta; uno sin pasos no', () => {
    const turnos = turnosDe('claude', SESION)
    const datos = datosDelTurno(turnos, 'a2')
    expect(datos?.resumen.pasos.map((paso) => [paso.segundo, paso.accion, paso.objeto])).toEqual([
      [3, 'corrio', 'pnpm test pricing']
    ])
    expect(datosDelTurno(turnos, 'a3')).toBeNull()
    expect(datosDelTurno(turnos, 'no-existe')).toBeNull()
  })
})

describe('desde el tablero', () => {
  it('toma el último turno de la sesión', () => {
    expect(datosDelUltimoTurno('claude', SESION)).toBeNull()
    expect(datosDelUltimoTurno('claude', SESION.slice(0, 4))?.resumen.pasos).toHaveLength(1)
  })

  it('la sesión de un espacio es la más reciente de sus agentes', () => {
    const sesion = (worktreeId: string, cuando: number, id: string) => ({
      worktreeId,
      agentType: 'codex' as const,
      stateStartedAt: cuando,
      providerSession: { key: 'codex' as never, id }
    })
    const state = {
      agentStatusByPaneKey: {
        a: sesion('wt-tienda', 10, 'vieja'),
        b: sesion('wt-tienda', 20, 'nueva'),
        c: sesion('wt-otro', 30, 'ajena')
      }
    } as unknown as Parameters<typeof ultimaSesionDe>[0]
    expect(ultimaSesionDe(state, 'wt-tienda')).toEqual({ agente: 'codex', id: 'nueva' })
    expect(ultimaSesionDe(state, 'wt-nada')).toBeNull()
  })
})
