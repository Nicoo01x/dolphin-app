// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DOLPHIN_UPDATE_FEED } from '../../../../shared/dolphin-brand'
import { useAppStore } from '../../store'
import { GeneralUpdateSettingsSection } from './updates/GeneralUpdateSettingsSection'

vi.mock('./updates/GeneralRemoteServerUpdates', () => ({ GeneralRemoteServerUpdates: () => null }))
vi.mock('./updates/ReleaseChannelSection', () => ({ ReleaseChannelSection: () => null }))

/**
 * El otro lado del portón: sin releases publicadas, Ajustes no ofrece actualizar.
 *
 * Por qué hace falta decirlo con una prueba: el archivo hermano simula `DOLPHIN_UPDATE_FEED` para
 * poder cubrir la lógica del actualizador, y sin esta quedaría todo el comportamiento probado con
 * la marca prendida —es decir, nadie comprobando lo que la gente ve hoy—. Y lo que ve hoy importa:
 * un botón «Download Update» con el feed en null bajaría una release de otro producto.
 */

beforeEach(() => {
  useAppStore.setState({
    updateStatus: { state: 'available', version: '1.4.200', changelog: null }
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      updater: {
        check: vi.fn(),
        download: vi.fn(),
        quitAndInstall: vi.fn(),
        getVersion: vi.fn().mockResolvedValue('1.4.199')
      }
    }
  })
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ updateStatus: { state: 'idle' } })
})

it('hoy Dolphin no publica releases, así que la marca está apagada', () => {
  expect(DOLPHIN_UPDATE_FEED).toBeNull()
})

it('con la marca apagada no ofrece descargar una actualización', () => {
  render(<GeneralUpdateSettingsSection />)
  expect(screen.queryByRole('button', { name: /download update/i })).toBeNull()
  expect(screen.queryByRole('button', { name: /check for updates/i })).toBeNull()
})

// La versión sí se muestra: saber en qué build estás no depende de que haya a dónde actualizar.
it('pero sigue diciendo en qué versión estás', () => {
  render(<GeneralUpdateSettingsSection />)
  expect(screen.getByText(/current version/i)).toBeTruthy()
})
