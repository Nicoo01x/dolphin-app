import { describe, expect, it } from 'vitest'
import { migrarClavesDeAlmacenamiento } from './dolphin-storage-key-migration'

function almacenamiento(inicial: Record<string, string>): Storage {
  const datos = new Map(Object.entries(inicial))
  return {
    get length() {
      return datos.size
    },
    key: (i: number) => [...datos.keys()][i] ?? null,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
    clear: () => datos.clear()
  }
}

describe('migrarClavesDeAlmacenamiento', () => {
  it('pasa orca:, orca- y orca. a dolphin y borra la vieja', () => {
    const storage = almacenamiento({
      'orca:structuredAgentLaunches:v1': '[1]',
      'orca-floating-terminal-panel-bounds-v1': '{"x":1}',
      'orca.web.runtimeEnvironment.v1': 'local',
      'otra-cosa': 'queda'
    })
    expect(migrarClavesDeAlmacenamiento(storage).sort()).toEqual([
      'dolphin-floating-terminal-panel-bounds-v1',
      'dolphin.web.runtimeEnvironment.v1',
      'dolphin:structuredAgentLaunches:v1'
    ])
    expect(storage.getItem('dolphin:structuredAgentLaunches:v1')).toBe('[1]')
    expect(storage.getItem('orca:structuredAgentLaunches:v1')).toBeNull()
    expect(storage.getItem('otra-cosa')).toBe('queda')
  })

  it('si ya existe la clave nueva, gana la nueva y la vieja se borra igual', () => {
    const storage = almacenamiento({
      'orca:pr-comment-presentation': 'flat',
      'dolphin:pr-comment-presentation': 'cards'
    })
    expect(migrarClavesDeAlmacenamiento(storage)).toEqual([])
    expect(storage.getItem('dolphin:pr-comment-presentation')).toBe('cards')
    expect(storage.getItem('orca:pr-comment-presentation')).toBeNull()
  })

  it('no toca claves que solo empiezan parecido', () => {
    const storage = almacenamiento({ orcaSettings: 'x', orca: 'y' })
    expect(migrarClavesDeAlmacenamiento(storage)).toEqual([])
    expect(storage.length).toBe(2)
  })
})
