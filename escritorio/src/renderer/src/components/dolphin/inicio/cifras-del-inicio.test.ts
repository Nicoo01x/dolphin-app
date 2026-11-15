import { describe, expect, it } from 'vitest'
import type { WorktreeStatus } from '../../../../../shared/worktree-status-rollup'
import type { TarjetaDelTablero } from '../../../../../shared/dolphin-tablero-types'
import { arribaDelInicio, haceCuanto } from './cifras-del-inicio'
import type { EspacioDelInicio } from './estado-del-inicio'

const AHORA = Date.parse('2026-11-11T15:00:00Z')

const espacio = (id: string, ultimaActividad = 0): EspacioDelInicio => ({
  id,
  repoId: 'r',
  nombre: id,
  proyecto: 'p',
  rama: null,
  ultimaActividad,
  creado: null
})

const base = {
  listo: true,
  proyectos: 2,
  espacios: [] as EspacioDelInicio[],
  estados: new Map<string, WorktreeStatus>(),
  teNecesita: [],
  tarjetas: null,
  ahora: AHORA
}

describe('lo que va arriba del inicio', () => {
  it('mientras no se sabe nada, nada', () => {
    expect(arribaDelInicio({ ...base, listo: false })).toEqual({ tipo: 'nada' })
  })

  it('un perfil nuevo no ve cifras en cero: ve la acción', () => {
    expect(arribaDelInicio({ ...base, proyectos: 0 })).toEqual({ tipo: 'accion' })
  })

  it('con trabajo: lo que corre, lo que espera revisión y lo que te necesita, sin ceros', () => {
    const espacios = [espacio('a'), espacio('b'), espacio('c'), espacio('d')]
    const estados = new Map<string, WorktreeStatus>([
      ['a', 'working'],
      ['b', 'working'],
      ['c', 'permission'],
      ['d', 'done']
    ])
    const teNecesita = [
      { espacio: espacio('c'), estado: 'permission' as const },
      { espacio: espacio('d'), estado: 'done' as const }
    ]
    expect(arribaDelInicio({ ...base, espacios, estados, teNecesita })).toEqual({
      tipo: 'cifras',
      cifras: [
        { clave: 'corriendo', valor: 2, estado: 'working' },
        { clave: 'para-revisar', valor: 1, estado: 'done' },
        { clave: 'te-necesita', valor: 1, estado: 'permission' }
      ]
    })
  })

  it('con tablero, lo que espera revisión son sus tarjetas en Para revisar', () => {
    const tarjetas = [
      { id: '1', titulo: 'x', columna: 'para-revisar', tipo: 'tarea', movida: '' },
      { id: '2', titulo: 'y', columna: 'para-revisar', tipo: 'tarea', movida: '' },
      { id: '3', titulo: 'z', columna: 'ideas', tipo: 'tarea', movida: '' }
    ] satisfies TarjetaDelTablero[]
    expect(arribaDelInicio({ ...base, tarjetas })).toEqual({
      tipo: 'cifras',
      cifras: [{ clave: 'para-revisar', valor: 2, estado: 'done' }]
    })
  })

  it('sin trabajo: cuántos proyectos y cuándo fue lo último', () => {
    const espacios = [espacio('a', AHORA - 3 * 3_600_000), espacio('b', AHORA - 30 * 3_600_000)]
    expect(arribaDelInicio({ ...base, espacios })).toEqual({
      tipo: 'cifras',
      cifras: [
        { clave: 'proyectos', valor: 2 },
        { clave: 'ultima', valor: 3, unidad: 'h' }
      ]
    })
  })

  it('cuánto pasó, en la unidad que se lee de lejos', () => {
    expect(haceCuanto(10_000).unidad).toBe('ahora')
    expect(haceCuanto(12 * 60_000)).toMatchObject({ valor: 12, unidad: 'min' })
    expect(haceCuanto(4 * 86_400_000)).toMatchObject({ valor: 4, unidad: 'd' })
  })
})
