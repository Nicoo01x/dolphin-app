import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { ajustesDelProyectoPara } from './leer-editorconfig'

/**
 * El recorrido hacia arriba.
 *
 * Se prueba con un lector de mentira en vez de armar carpetas de verdad: lo que hay que verificar
 * es QUÉ archivos se piden y en qué orden se aplican, no que `readFile` funcione.
 */

const raiz = resolve('/repo')

function lector(archivos: Readonly<Record<string, string>>) {
  const pedidos: string[] = []
  const leer = async (ruta: string): Promise<string | null> => {
    pedidos.push(ruta)
    const clave = Object.keys(archivos).find((k) => resolve(k) === resolve(ruta))
    return clave ? (archivos[clave] ?? null) : null
  }
  return { leer, pedidos }
}

describe('buscar los .editorconfig hacia arriba', () => {
  it('toma el de la raíz cuando no hay otro', async () => {
    const { leer } = lector({
      '/repo/.editorconfig': 'root = true\n[*]\nindent_style = tab\ntab_width = 4\n'
    })
    const r = await ajustesDelProyectoPara(resolve('/repo/src/a.go'), raiz, leer)
    expect(r.estiloDeSangria).toBe('tab')
    expect(r.anchoDeTab).toBe(4)
  })

  it('el de la subcarpeta le gana al de la raíz', async () => {
    const { leer } = lector({
      '/repo/.editorconfig': 'root = true\n[*]\nindent_style = space\nindent_size = 4\n',
      '/repo/src/.editorconfig': '[*]\nindent_size = 2\n'
    })
    const r = await ajustesDelProyectoPara(resolve('/repo/src/a.ts'), raiz, leer)
    expect(r.tamanoDeSangria).toBe(2)
    // Lo que el de adentro no declara lo sigue poniendo el de la raíz.
    expect(r.estiloDeSangria).toBe('space')
  })

  it('para de subir en el primero que dice root', async () => {
    const { leer, pedidos } = lector({
      '/repo/src/.editorconfig': 'root = true\n[*]\nindent_size = 2\n',
      '/repo/.editorconfig': '[*]\nindent_size = 8\n'
    })
    const r = await ajustesDelProyectoPara(resolve('/repo/src/a.ts'), raiz, leer)
    expect(r.tamanoDeSangria).toBe(2)
    expect(pedidos.map((p) => resolve(p))).not.toContain(resolve('/repo/.editorconfig'))
  })

  it('no sube más allá de la raíz del worktree', async () => {
    const { leer, pedidos } = lector({})
    await ajustesDelProyectoPara(resolve('/repo/src/a.ts'), raiz, leer)
    expect(pedidos.map((p) => resolve(p))).toEqual([
      resolve('/repo/src/.editorconfig'),
      resolve('/repo/.editorconfig')
    ])
  })

  it('un archivo de afuera del worktree no sale a recorrer el disco', async () => {
    const { leer, pedidos } = lector({})
    const r = await ajustesDelProyectoPara(resolve('/otro/a.ts'), raiz, leer)
    expect(r).toEqual({})
    expect(pedidos).toEqual([])
  })

  it('el glob se mide contra la carpeta de SU .editorconfig, no contra la raíz', async () => {
    // `[*.ts]` dentro de src/ habla de los .ts de src/, y la ruta relativa que ve es «a.ts».
    const { leer } = lector({
      '/repo/.editorconfig': 'root = true\n[src/*.ts]\nindent_size = 4\n',
      '/repo/src/.editorconfig': '[*.ts]\nindent_size = 2\n'
    })
    const r = await ajustesDelProyectoPara(resolve('/repo/src/a.ts'), raiz, leer)
    expect(r.tamanoDeSangria).toBe(2)
  })

  it('sin ningún .editorconfig no devuelve nada, y no inventa defaults', async () => {
    const { leer } = lector({})
    expect(await ajustesDelProyectoPara(resolve('/repo/a.ts'), raiz, leer)).toEqual({})
  })

  it('un error de lectura se trata como «no está» y no impide abrir el archivo', async () => {
    // Un `.editorconfig` sin permisos en una carpeta del medio: se pierde esa capa, nada más.
    const leer = vi.fn(async (ruta: string) => {
      if (resolve(ruta) === resolve('/repo/src/.editorconfig')) {
        throw new Error('EACCES')
      }
      return resolve(ruta) === resolve('/repo/.editorconfig')
        ? 'root = true\n[*]\nindent_size = 4\n'
        : null
    })
    const r = await ajustesDelProyectoPara(resolve('/repo/src/a.ts'), raiz, leer)
    expect(r.tamanoDeSangria).toBe(4)
  })
})
