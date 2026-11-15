import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { leerTableroDeRepo } from './dolphin-tablero'

const carpeta = join('/repo', '.dolphin', 'tablero')

function discoCon(archivos: Record<string, string>) {
  return {
    listar: async () => Object.keys(archivos),
    leer: async (ruta: string) => {
      const nombre = Object.keys(archivos).find((n) => ruta === join(carpeta, n))
      if (nombre === undefined) {
        throw new Error('no existe')
      }
      return archivos[nombre]
    }
  }
}

describe('leerTableroDeRepo', () => {
  it('lee las tarjetas y se salta lo que no se entiende', async () => {
    const tablero = await leerTableroDeRepo(
      '/repo',
      discoCon({
        'a.json': JSON.stringify({ id: 'a', titulo: 'Una', columna: 'para-hacer' }),
        'rota.json': '{ no es json',
        'columna-rara.json': JSON.stringify({ id: 'b', titulo: 'Otra', columna: 'archivo' }),
        'notas.txt': 'no es una tarjeta'
      })
    )
    expect(tablero).toEqual({
      ok: true,
      tarjetas: [expect.objectContaining({ id: 'a', titulo: 'Una', columna: 'para-hacer' })]
    })
  })

  it('un repo sin carpeta de tablero es «sin tablero», no un error', async () => {
    const tablero = await leerTableroDeRepo('/repo', {
      listar: async () => {
        throw new Error('ENOENT')
      },
      leer: async () => ''
    })
    expect(tablero).toEqual({ ok: false })
  })

  it('una carpeta sin tarjetas da un tablero vacío', async () => {
    expect(await leerTableroDeRepo('/repo', discoCon({}))).toEqual({ ok: true, tarjetas: [] })
  })
})
