import { vi } from 'vitest'

// Las suites del actualizador prueban el comportamiento CON un feed propio; el feed real es
// null (Dolphin todavía no publica releases), así que sin esto el actualizador no hace nada.
vi.mock('../shared/dolphin-brand', () => ({
  DOLPHIN_UPDATE_FEED: { owner: 'test-owner', repo: 'test-repo' },
  // Las suites prueban la instalación sola de macOS: la descarga manual tiene su propio test.
  DOLPHIN_MAC_ACTUALIZA_SOLO: true,
  DOLPHIN_WHATS_NEW_URL: 'https://updates.example.test/whats-new',
  getDolphinUpdateRepository: () => 'test-owner/test-repo'
}))
