import type * as FsPromises from 'node:fs/promises'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// El rename falla como en Windows con un antivirus mirando el archivo, y después anda.
const fallas = vi.hoisted(() => ({ quedan: 0 }))
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof FsPromises>()
  return {
    ...real,
    rename: async (desde: string, hasta: string) => {
      if (fallas.quedan > 0) {
        fallas.quedan -= 1
        throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' })
      }
      return real.rename(desde, hasta)
    }
  }
})

import { crearPreferenciasDeIsla } from './dolphin-isla-preferencias'

let carpeta = ''
beforeEach(async () => {
  carpeta = await mkdtemp(join(tmpdir(), 'isla-reintento-'))
})
afterEach(async () => {
  fallas.quedan = 0
  await rm(carpeta, { recursive: true, force: true })
})

describe('guardar la isla con el archivo ocupado', () => {
  it('reintenta el rename en vez de perder el cambio', async () => {
    fallas.quedan = 2
    const ruta = join(carpeta, 'dolphin-isla.json')
    await crearPreferenciasDeIsla(ruta).guardar({ notas: 'no se pierde' })
    expect(JSON.parse(await readFile(ruta, 'utf8'))).toEqual({ notas: 'no se pierde' })
  })
})
