import { beforeEach, describe, expect, it, vi } from 'vitest'

const { autoUpdaterMock, moduleFactories, resetUpdaterMocks } = await vi.hoisted(async () =>
  (await import('./updater/testing/updater-test-harness')).createUpdaterMocks()
)

vi.mock('../shared/dolphin-brand', () => ({
  DOLPHIN_UPDATE_FEED: null,
  DOLPHIN_WHATS_NEW_URL: null,
  getDolphinUpdateRepository: () => null
}))
vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./updater/electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('./ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./updater/linux-package/linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater/updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./updater/releases/updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./updater/nudges/nudge-campaign', () => moduleFactories.updaterNudge())
vi.mock('./updater/update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./updater/releases/updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('./local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())

describe('updater without a Dolphin release feed', () => {
  beforeEach(() => {
    resetUpdaterMocks()
  })

  it('does not check and reports not-available from the menu', async () => {
    const { checkForUpdates, checkForUpdatesFromMenu, getUpdateStatus, setupAutoUpdater } =
      await import('./updater/updater-service')

    setupAutoUpdater(null)
    checkForUpdates()
    checkForUpdatesFromMenu()

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(getUpdateStatus()).toMatchObject({ state: 'not-available', userInitiated: true })
  })
})
