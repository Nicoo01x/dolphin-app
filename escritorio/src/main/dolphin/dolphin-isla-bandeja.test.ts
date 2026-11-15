import { describe, expect, it } from 'vitest'
import { leerBandejasDeIsla } from './dolphin-isla-bandeja'
import { esEscrituraDesdeIsla } from '../../shared/dolphin-isla-types'

const bandeja = (asuntos: unknown[]): string => JSON.stringify({ asuntos })
const asunto = (id: string, estado: string, creado: string, tipo = 'idea'): unknown => ({
  id,
  tipo,
  titulo: `t-${id}`,
  estado,
  creado,
  detalle: 'no viaja'
})

describe('la bandeja en la isla', () => {
  it('junta lo abierto de cada repo, lo más nuevo primero, con el nombre del repo', async () => {
    const archivos: Record<string, string> = {
      '/r/app/.dolphin/bandeja.json': bandeja([
        asunto('a', 'abierto', '2026-10-22T10:00:00Z'),
        asunto('b', 'hecho', '2026-10-23T10:00:00Z'),
        asunto('c', 'implementando', '2026-10-23T09:00:00Z', 'error')
      ]),
      '/r/web/.dolphin/bandeja.json': bandeja([asunto('d', 'rechazado', '2026-10-23T11:00:00Z')])
    }
    const leer = async (ruta: string): Promise<string> => {
      const clave = ruta.replace(/\\/g, '/')
      if (!(clave in archivos)) {
        throw new Error('ENOENT')
      }
      return archivos[clave]
    }

    const asuntos = await leerBandejasDeIsla(
      [{ path: '/r/app', displayName: 'Mi app' }, { path: '/r/web' }, { path: '/r/sin-bandeja' }],
      leer
    )

    expect(asuntos).toEqual([
      { id: 'c', repo: 'Mi app', tipo: 'error', titulo: 't-c', creado: '2026-10-23T09:00:00Z' },
      { id: 'a', repo: 'Mi app', tipo: 'idea', titulo: 't-a', creado: '2026-10-22T10:00:00Z' }
    ])
  })

  it('una bandeja rota o con otra forma no aporta nada, y no rompe a las demás', async () => {
    const asuntos = await leerBandejasDeIsla(
      [{ path: '/x' }, { path: '/y' }, { path: '/sana' }],
      async (ruta) => {
        const clave = ruta.replace(/\\/g, '/')
        if (clave.startsWith('/x')) {
          return '{ roto'
        }
        if (clave.startsWith('/y')) {
          return JSON.stringify({ asuntos: 'no' })
        }
        return bandeja([asunto('s', 'abierto', '2026-10-23T08:00:00Z')])
      }
    )
    expect(asuntos.map((a) => `${a.repo}:${a.id}`)).toEqual(['sana:s'])
  })
})

describe('lo que se le escribe a un agente desde la isla', () => {
  it('pide un pane, una terminal y un texto con algo, no más largo que una respuesta rápida', () => {
    const base = { paneKey: 'tab:pane', ptyId: 'pty-1' }
    expect(esEscrituraDesdeIsla({ ...base, texto: 'dale, seguí' })).toBe(true)
    expect(esEscrituraDesdeIsla({ ...base, texto: '   ' })).toBe(false)
    expect(esEscrituraDesdeIsla({ ...base, ptyId: '', texto: 'hola' })).toBe(false)
    expect(esEscrituraDesdeIsla({ ptyId: 'pty-1', texto: 'hola' })).toBe(false)
    expect(esEscrituraDesdeIsla({ ...base, texto: 'x'.repeat(4_001) })).toBe(false)
    expect(esEscrituraDesdeIsla(null)).toBe(false)
  })

  it('un ptyId con la ruta entera de un worktree hondo también vale', () => {
    const ptyId = `repo-1::C:/Users/nico/${'carpeta-honda/'.repeat(20)}rama-larga@@abcd1234`
    expect(ptyId.length).toBeGreaterThan(200)
    expect(esEscrituraDesdeIsla({ paneKey: 'tab:pane', ptyId, texto: 'hola' })).toBe(true)
  })
})
