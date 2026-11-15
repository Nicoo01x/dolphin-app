import { describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '../../../shared/update-status-types'
import type * as DolphinBrand from '../../../shared/dolphin-brand'

const marca = vi.hoisted(() => ({ macActualizaSolo: false }))

vi.mock('../../../shared/dolphin-brand', async (importOriginal) => {
  const original = await importOriginal<typeof DolphinBrand>()
  return {
    ...original,
    DOLPHIN_UPDATE_FEED: { owner: 'Nicoo01x', repo: 'dolphin-app' },
    get DOLPHIN_MAC_ACTUALIZA_SOLO() {
      return marca.macActualizaSolo
    }
  }
})

const { conDescargaManual, macActualizaPorDescarga, urlDeDescargaManual } =
  await import('./mac-descarga-manual')

const disponible: UpdateStatus = { state: 'available', version: '1.6.1', changelog: null }

describe('descarga manual en macOS sin firma', () => {
  it('en una Mac sin firma la versión nueva se baja a mano', () => {
    marca.macActualizaSolo = false
    expect(macActualizaPorDescarga('darwin')).toBe(true)
  })

  it('Windows y Linux siguen instalando solos', () => {
    marca.macActualizaSolo = false
    expect(macActualizaPorDescarga('win32')).toBe(false)
    expect(macActualizaPorDescarga('linux')).toBe(false)
  })

  it('con la Mac firmada vuelve la instalación sola', () => {
    marca.macActualizaSolo = true
    expect(macActualizaPorDescarga('darwin')).toBe(false)
    marca.macActualizaSolo = false
  })

  it('el aviso lleva a la release de esa versión en el repo de Dolphin', () => {
    expect(urlDeDescargaManual('1.6.1')).toBe(
      'https://github.com/Nicoo01x/dolphin-app/releases/tag/v1.6.1'
    )
    expect(conDescargaManual(disponible, 'darwin')).toEqual({
      ...disponible,
      manualDownloadUrl: 'https://github.com/Nicoo01x/dolphin-app/releases/tag/v1.6.1'
    })
  })

  it('no toca el aviso fuera de macOS ni los otros estados', () => {
    expect(conDescargaManual(disponible, 'win32')).toBe(disponible)
    const buscando: UpdateStatus = { state: 'checking' }
    expect(conDescargaManual(buscando, 'darwin')).toBe(buscando)
  })
})
