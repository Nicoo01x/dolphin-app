import { describe, expect, it, vi } from 'vitest'

vi.mock('../shared/dolphin-brand', () => ({
  DOLPHIN_UPDATE_FEED: null,
  DOLPHIN_WHATS_NEW_URL: null,
  getDolphinUpdateRepository: () => null
}))

vi.mock('electron', () => ({
  app: { isPackaged: true },
  powerMonitor: { on: vi.fn() }
}))

describe('updater without a Dolphin release feed', () => {
  it('does not fetch nudge or changelog data', async () => {
    const { fetchNudge } = await import('./updater/nudges/nudge-campaign')
    const { fetchChangelog } = await import('./updater/releases/updater-changelog')
    await expect(fetchNudge()).resolves.toBeNull()
    await expect(fetchChangelog('1.0.1', '1.0.0')).resolves.toBeNull()
  })
})
