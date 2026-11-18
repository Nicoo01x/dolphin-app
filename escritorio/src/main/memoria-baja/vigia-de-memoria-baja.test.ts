import { describe, expect, it, vi } from 'vitest'
import type { AvisoDeMemoriaBaja, ModoPocaRamSettings } from '../../shared/modo-poca-ram'
import { acortarEsperaConPocaRam, ESPERA_DE_CHAT_CON_POCA_RAM_MS } from './modo-activo'
import { VigiaDeMemoriaBaja } from './vigia-de-memoria-baja'

const GB = 1024 ** 3

function armar(ajustes: ModoPocaRamSettings, disponibles: number[]) {
  const avisos: AvisoDeMemoriaBaja[] = []
  const leerMemoria = vi.fn(async () => ({
    availableMemory: disponibles.shift() ?? 8 * GB,
    totalMemory: 16 * GB
  }))
  const sacarFoto = vi.fn(async () => ({ worktrees: [], totalMemory: 2 * GB }))
  let reloj = 0
  const vigia = new VigiaDeMemoriaBaja({
    leerAjustes: () => ajustes,
    leerMemoria,
    sacarFoto,
    avisar: (aviso) => avisos.push(aviso),
    ahora: () => (reloj += 5_000)
  })
  return { vigia, avisos, leerMemoria, sacarFoto }
}

describe('VigiaDeMemoriaBaja', () => {
  it('apagado no lee la memoria', async () => {
    const { vigia, leerMemoria } = armar({ modoPocaRam: 'apagado' }, [0.1 * GB])
    await vigia.muestrear()
    expect(leerMemoria).not.toHaveBeenCalled()
    expect(vigia.activo()).toBe(false)
  })

  it('saca la foto cara sólo cuando hay que avisar', async () => {
    const { vigia, avisos, sacarFoto } = armar({}, [1 * GB, 1 * GB, 1 * GB])
    await vigia.muestrear()
    expect(sacarFoto).not.toHaveBeenCalled()
    await vigia.muestrear()
    await vigia.muestrear()
    expect(sacarFoto).toHaveBeenCalledTimes(1)
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({
      disponible: 1 * GB,
      total: 16 * GB,
      dolphin: 2 * GB,
      masPesado: { tipo: 'dolphin' },
      motivo: 'umbral'
    })
    expect(vigia.activo()).toBe(true)
  })

  it('usa el umbral de los ajustes', async () => {
    const { vigia, avisos } = armar({ umbralPocaRamGb: 4 }, [3 * GB, 3 * GB])
    await vigia.muestrear()
    await vigia.muestrear()
    expect(avisos).toHaveLength(1)
  })

  it('«siempre» avisa enseguida, con su motivo', async () => {
    const { vigia, avisos } = armar({ modoPocaRam: 'siempre' }, [12 * GB])
    await vigia.muestrear()
    expect(avisos).toEqual([expect.objectContaining({ motivo: 'siempre' })])
  })
})

describe('acortarEsperaConPocaRam', () => {
  it('acorta la espera de un chat quieto sólo con el modo activo', () => {
    expect(acortarEsperaConPocaRam(30 * 60_000, true)).toBe(ESPERA_DE_CHAT_CON_POCA_RAM_MS)
    expect(acortarEsperaConPocaRam(30 * 60_000, false)).toBe(30 * 60_000)
  })

  it('nunca alarga una espera más corta, y respeta «nunca»', () => {
    expect(acortarEsperaConPocaRam(60_000, true)).toBe(60_000)
    expect(acortarEsperaConPocaRam(null, true)).toBeNull()
  })
})
