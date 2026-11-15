import { describe, expect, it } from 'vitest'
import type { WorktreeStatus } from '../../../../../shared/worktree-status-rollup'
import {
  esCarpetaPersonal,
  espaciosDelInicio,
  espaciosPorRama,
  inicioDelDia,
  loDeHoy,
  loQueTeNecesita,
  ramaCorta,
  type EspacioDelInicio
} from './estado-del-inicio'

const AHORA = new Date(2026, 10, 11, 15, 0).getTime()
const AYER = AHORA - 24 * 60 * 60 * 1000

const espacio = (parcial: Partial<EspacioDelInicio> & { id: string }): EspacioDelInicio => ({
  repoId: 'r1',
  nombre: parcial.id,
  proyecto: 'dolphin-app',
  rama: null,
  ultimaActividad: AYER,
  creado: null,
  ...parcial
})

const estados = (pares: Record<string, WorktreeStatus>): Map<string, WorktreeStatus> =>
  new Map(Object.entries(pares))

describe('espaciosDelInicio', () => {
  it('lista los espacios vivos de cada proyecto con la rama corta, sin archivados ni borrándose', () => {
    expect(
      espaciosDelInicio([{ id: 'r1', displayName: 'dolphin-app' }], {
        r1: [
          { id: 'w1', displayName: 'uno', branch: 'refs/heads/feat/x', lastActivityAt: 5 },
          { id: 'w2', displayName: 'dos', isArchived: true },
          { id: 'w3', displayName: 'tres', removing: true }
        ]
      })
    ).toEqual([
      {
        id: 'w1',
        repoId: 'r1',
        nombre: 'uno',
        proyecto: 'dolphin-app',
        rama: 'feat/x',
        ultimaActividad: 5,
        creado: null,
        ultimoMovimiento: null
      }
    ])
  })

  it('el último movimiento es el de un agente, una terminal o la creación, no el de la detección', () => {
    const [detectado, conAgente, conTerminal] = espaciosDelInicio(
      [{ id: 'r1', displayName: 'dolphin-app' }],
      {
        r1: [
          // La base sella `lastActivityAt` al detectar un worktree: eso no es actividad.
          { id: 'w1', displayName: 'detectado', lastActivityAt: 900 },
          { id: 'w2', displayName: 'agente', lastActivityAt: 900, smartAt: 700, createdAt: 100 },
          { id: 'w3', displayName: 'terminal', lastActivityAt: 900, lastTerminalUseAt: 800 }
        ]
      }
    )
    expect(detectado?.ultimoMovimiento).toBeNull()
    expect(conAgente?.ultimoMovimiento).toBe(700)
    expect(conTerminal?.ultimoMovimiento).toBe(800)
  })

  it('ramaCorta deja igual una rama que ya es corta y da null sin rama', () => {
    expect(ramaCorta('main')).toBe('main')
    expect(ramaCorta(null)).toBeNull()
  })
})

describe('loQueTeNecesita', () => {
  it('trae primero lo frenado y después lo que espera revisión; lo demás no llama', () => {
    const lista = [
      espacio({ id: 'listo' }),
      espacio({ id: 'trabajando' }),
      espacio({ id: 'permiso' }),
      espacio({ id: 'fallo' })
    ]
    const resultado = loQueTeNecesita(
      lista,
      estados({ listo: 'done', trabajando: 'working', permiso: 'permission', fallo: 'failed' })
    )
    expect(resultado.map(({ espacio: e }) => e.id)).toEqual(['permiso', 'fallo', 'listo'])
  })
})

describe('loDeHoy', () => {
  it('trae lo que se movió o se creó hoy, lo último arriba, sin repetir lo que ya te necesita', () => {
    const lista = [
      espacio({ id: 'viejo', ultimaActividad: AYER }),
      espacio({ id: 'temprano', ultimaActividad: inicioDelDia(AHORA) + 1000 }),
      espacio({ id: 'recien', ultimaActividad: AHORA - 1000 }),
      espacio({ id: 'creado-hoy', ultimaActividad: 0, creado: AHORA - 5000 }),
      espacio({ id: 'avisado', ultimaActividad: AHORA })
    ]
    const resultado = loDeHoy(lista, estados({ recien: 'working' }), AHORA, new Set(['avisado']))
    // Lo último arriba según cuándo se movió: el creado hace 5 s va antes que el de la mañana.
    expect(resultado.map(({ espacio: e }) => e.id)).toEqual(['recien', 'creado-hoy', 'temprano'])
    expect(resultado[0].estado).toBe('working')
    expect(resultado[1].estado).toBe('inactive')
  })

  it('los worktrees recién detectados de un repo recién agregado no son «hoy»', () => {
    // Lo que pasaba al agregar un repo con muchos worktrees: 16 detectados a las 19:28, «Hoy · 17».
    const detectadoHoy = AHORA - 60_000
    const lista = [
      espacio({ id: 'detectado', ultimaActividad: detectadoHoy, ultimoMovimiento: null }),
      espacio({ id: 'detectado-viejo', ultimaActividad: detectadoHoy, ultimoMovimiento: AYER }),
      espacio({ id: 'agente-hoy', ultimaActividad: detectadoHoy, ultimoMovimiento: AHORA - 5000 }),
      espacio({ id: 'terminal-hoy', ultimaActividad: AYER, ultimoMovimiento: AHORA - 9000 }),
      espacio({ id: 'trabajando', ultimaActividad: detectadoHoy, ultimoMovimiento: null })
    ]
    const resultado = loDeHoy(lista, estados({ trabajando: 'working' }), AHORA, new Set())
    expect(resultado.map(({ espacio: e }) => e.id)).toEqual([
      'agente-hoy',
      'terminal-hoy',
      'trabajando'
    ])
  })
})

describe('espaciosPorRama', () => {
  it('une cada rama del proyecto con su espacio más reciente y deja afuera otros proyectos', () => {
    const lista = [
      espacio({ id: 'a', rama: 'feat/x', ultimaActividad: 1 }),
      espacio({ id: 'b', rama: 'feat/x', ultimaActividad: 2 }),
      espacio({ id: 'c', rama: 'feat/y', repoId: 'r2' })
    ]
    const porRama = espaciosPorRama(lista, 'r1', estados({ b: 'working' }))
    expect(porRama.get('feat/x')).toMatchObject({ espacio: { id: 'b' }, estado: 'working' })
    expect(porRama.has('feat/y')).toBe(false)
  })
})

describe('esCarpetaPersonal', () => {
  it('reconoce la carpeta del home por la ruta, no por el nombre', () => {
    const home = String.raw`C:\Users\ana`
    const proyecto = String.raw`C:\Users\ana\proyecto`
    expect(esCarpetaPersonal({ kind: 'folder', path: 'c:/users/ana/' }, home, true)).toBe(true)
    expect(esCarpetaPersonal({ kind: 'folder', path: proyecto }, home, true)).toBe(false)
    // Un repo git en el home es un proyecto de verdad.
    expect(esCarpetaPersonal({ kind: 'git', path: home }, home, true)).toBe(false)
    expect(esCarpetaPersonal({ kind: 'folder', path: home }, null, true)).toBe(false)
  })

  it('en Linux la mayúscula importa', () => {
    expect(esCarpetaPersonal({ kind: 'folder', path: '/home/Nico' }, '/home/nico', false)).toBe(
      false
    )
    expect(esCarpetaPersonal({ kind: 'folder', path: '/home/nico/' }, '/home/nico', false)).toBe(
      true
    )
  })
})
