import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../../shared/agent-status/contracts/agent-status-types'
import { estadosDeLosTrabajos } from './estados-de-los-trabajos'

function entrada(state: AgentStatusEntry['state']): AgentStatusEntry {
  return { state, prompt: '', updatedAt: 1 } as AgentStatusEntry
}

describe('estados de los trabajos', () => {
  it('lee el estado de cada compañero por su pestaña', () => {
    expect(
      estadosDeLosTrabajos(
        { 'tab-1:hoja-a': entrada('working'), 'tab-2:hoja-a': entrada('waiting') },
        ['tab-1', 'tab-2']
      )
    ).toEqual({ 'tab-1': 'working', 'tab-2': 'waiting' })
  })

  // Lo que hace que la tira no se re-renderice por ruido ajeno: el resto de la app no entra.
  it('deja afuera las pestañas que no son de la tira', () => {
    expect(
      estadosDeLosTrabajos({ 'tab-1:a': entrada('working'), 'otra:a': entrada('blocked') }, [
        'tab-1'
      ])
    ).toEqual({ 'tab-1': 'working' })
  })

  it('un compañero que todavía no reportó no tiene estado', () => {
    expect(estadosDeLosTrabajos({ 'tab-1:a': entrada('done') }, ['tab-1', 'tab-2'])).toEqual({
      'tab-1': 'done'
    })
  })

  it('sin estado de agentes o sin compañeros no devuelve nada', () => {
    expect(estadosDeLosTrabajos(undefined, ['tab-1'])).toEqual({})
    expect(estadosDeLosTrabajos({ 'tab-1:a': entrada('working') }, [])).toEqual({})
  })

  // Una clave sin hoja no nombra un panel: tomarla como `tabId` le pondría estado a una pestaña
  // por un dato que no es de ella.
  it('una clave de panel sin hoja se ignora', () => {
    expect(estadosDeLosTrabajos({ 'tab-1': entrada('working') }, ['tab-1'])).toEqual({})
    expect(estadosDeLosTrabajos({ ':hoja': entrada('working') }, ['tab-1'])).toEqual({})
  })
})
