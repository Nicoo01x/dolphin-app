import { app, powerMonitor, shell } from 'electron'
import type { BrowserWindow } from 'electron'
import type { ReleaseBuild, ReleaseChannel } from '../../../shared/release-channel'
import type { ReleaseBuildListOptions } from '../releases/updater-release-build-cache'
import type {
  LinuxPackageInstallInstructions,
  UpdateCheckOptions,
  UpdateStatus
} from '../../../shared/update-status-types'
import type {
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot,
  RemoteServerUpdateSupport
} from '../../../shared/remote-server-update'
import { getLinuxPackageType } from '../linux-package/linux-update-package-type'
import { createUpdaterDiagnosticLogger } from '../linux-package/linux-package-install-diagnostic'
import { registerAutoUpdaterHandlers } from '../updater-events'
import { getServeUpdateHandoffFailure } from '../serve-update-handoff'
import { recordUpdaterLifecycle } from '../updater-lifecycle-diagnostics'
import { AUTO_UPDATE_CHECK_INTERVAL_MS } from './updater-state'
import { UpdaterDownloadInstall } from './updater-download-install'
import { configureMacShipItScheduling } from '../mac-install/macos-shipit-scheduling'
import { handleElectronUpdaterProxyLogin } from './electron-updater-proxy-session'
import { resolveWindowsUpdateInstallDirectory } from './windows-update-install-directory'
import type { PreQuitCleanupFailureMode, UpdateInstallMode } from './updater-state'
import { DOLPHIN_UPDATE_FEED } from '../../../shared/dolphin-brand'
import {
  conDescargaManual,
  macActualizaPorDescarga,
  urlDeDescargaManual
} from '../mac-install/mac-descarga-manual'

export type UpdaterSetupOptions = {
  getMainWindow?: () => BrowserWindow | null
  getLastUpdateCheckAt?: () => number | null
  onBeforeQuit?: () => void | Promise<void>
  setLastUpdateCheckAt?: (timestamp: number) => void
  getPendingUpdateNudgeId?: () => string | null
  getDismissedUpdateNudgeId?: () => string | null
  setPendingUpdateNudgeId?: (id: string | null) => void
  setDismissedUpdateNudgeId?: (id: string | null) => void
  getReleaseChannelOverride?: () => ReleaseChannel | null
  getUpdateDelayDays?: () => number
  installMode?: UpdateInstallMode
  onBeforeQuitFailure?: PreQuitCleanupFailureMode
}

export class UpdaterSetup extends UpdaterDownloadInstall {
  checkForUpdates(): void {
    if (!DOLPHIN_UPDATE_FEED) {
      return
    }
    this.checkForUpdatesInBackground()
  }

  checkForUpdatesFromMenu(options?: UpdateCheckOptions): void {
    if (!DOLPHIN_UPDATE_FEED) {
      // Why: quien lo pidió quedó en «buscando»; sin respuesta el spinner no se va nunca.
      this.sendStatus({ state: 'not-available', userInitiated: true })
      return
    }
    super.checkForUpdatesFromMenu(options)
  }

  downloadUpdate(): void {
    if (this.abrirDescargaManual()) {
      return
    }
    super.downloadUpdate()
  }

  /** macOS sin firma: el aviso lleva adónde bajar la versión, porque no se puede instalar sola. */
  protected sendStatus(status: UpdateStatus, options?: { force?: boolean }): void {
    super.sendStatus(conDescargaManual(status), options)
  }

  /**
   * Why: Squirrel.Mac rechaza al final una versión sin firma, así que bajarla entera es gastar la
   * descarga para un error. En esa Mac «Actualizar» abre la release en el navegador, venga de la
   * tarjeta, de Ajustes o de cualquier llamada directa por IPC.
   */
  private abrirDescargaManual(): boolean {
    if (!macActualizaPorDescarga() || this.currentStatus.state !== 'available') {
      return false
    }
    const url = urlDeDescargaManual(this.currentStatus.version)
    if (!url) {
      return false
    }
    void shell.openExternal(url).catch((error: unknown) => {
      console.warn('[updater] no se pudo abrir la página de la versión nueva:', error)
    })
    return true
  }

  quitAndInstall(): void {
    super.quitAndInstall()
  }

  isQuittingForUpdate(): boolean {
    return super.isQuittingForUpdate()
  }

  getUpdateStatus(): UpdateStatus {
    return super.getUpdateStatus()
  }

  getRemoteServerUpdateSupport(): RemoteServerUpdateSupport {
    return super.getRemoteServerUpdateSupport()
  }

  getRemoteServerUpdaterSnapshot(runtimeId: string): RemoteServerUpdaterSnapshot {
    return super.getRemoteServerUpdaterSnapshot(runtimeId)
  }

  checkForRemoteServerUpdate(
    runtimeId: string,
    options?: UpdateCheckOptions
  ): RemoteServerUpdaterSnapshot {
    return super.checkForRemoteServerUpdate(runtimeId, options)
  }

  downloadRemoteServerUpdate(runtimeId: string): RemoteServerUpdaterSnapshot {
    return super.downloadRemoteServerUpdate(runtimeId)
  }

  installRemoteServerUpdate(runtimeId: string): RemoteServerUpdateInstallResult {
    return super.installRemoteServerUpdate(runtimeId)
  }

  resolveUpdateInstallMode(isServeMode: boolean): UpdateInstallMode {
    return super.resolveUpdateInstallMode(isServeMode)
  }

  async getLinuxPackageInstallInstructions(): Promise<LinuxPackageInstallInstructions> {
    return super.getLinuxPackageInstallInstructions()
  }

  async showLinuxPackage(): Promise<void> {
    return super.showLinuxPackage()
  }

  async listAvailableReleaseBuilds(
    channel: ReleaseChannel,
    options?: ReleaseBuildListOptions
  ): Promise<ReleaseBuild[]> {
    return super.listAvailableReleaseBuilds(channel, options)
  }

  dismissNudge(): void {
    super.dismissNudge()
  }

  dismissAvailableUpdate(): void {
    super.dismissAvailableUpdate()
  }

  setupAutoUpdater(mainWindow: BrowserWindow | null, opts?: UpdaterSetupOptions): void {
    // Keep direct-window callers compatible; desktop composition supplies the lifecycle getter.
    this.getMainWindow = opts?.getMainWindow ?? (mainWindow ? () => mainWindow : this.getMainWindow)
    this.onBeforeQuitCleanup = opts?.onBeforeQuit ?? null
    this.onBeforeQuitFailure = opts?.onBeforeQuitFailure ?? 'continue'
    this.persistLastUpdateCheckAt = opts?.setLastUpdateCheckAt ?? null
    this._getLastUpdateCheckAt = opts?.getLastUpdateCheckAt ?? null
    this._getPendingUpdateNudgeId = opts?.getPendingUpdateNudgeId ?? null
    this._getDismissedUpdateNudgeId = opts?.getDismissedUpdateNudgeId ?? null
    this._setPendingUpdateNudgeId = opts?.setPendingUpdateNudgeId ?? null
    this._setDismissedUpdateNudgeId = opts?.setDismissedUpdateNudgeId ?? null
    this.getReleaseChannelOverride = opts?.getReleaseChannelOverride ?? null
    this.getUpdateDelayDays = opts?.getUpdateDelayDays ?? null
    this.updateInstallMode = opts?.installMode ?? 'interactive'
    this.lastInstallDeferralVersion = { download: null, install: null }

    if (!DOLPHIN_UPDATE_FEED) {
      return
    }

    const serveHandoffFailure = getServeUpdateHandoffFailure()
    if (serveHandoffFailure) {
      recordUpdaterLifecycle(
        'headless_serve_handoff_failed',
        { reason: serveHandoffFailure },
        { level: 'warn', message: 'Supervised serve update did not complete' }
      )
      this.sendErrorStatus(`The server update did not complete: ${serveHandoffFailure}`, true)
    }

    if (!app.isPackaged) {
      return
    }

    const autoUpdater = this.getAutoUpdater()
    configureMacShipItScheduling()
    autoUpdater.autoDownload = false
    if (this.activeUpdateSource === 'release') {
      autoUpdater.allowDowngrade = false
      autoUpdater.disableDifferentialDownload = false
    }
    // Implicit quit install requires interactive mode and an explicit non-root/AppImage marker; serve requires handoff.
    autoUpdater.autoInstallOnAppQuit =
      this.updateInstallMode === 'interactive' && getLinuxPackageType() === 'non-root'
    // MacUpdater ignores quitAndInstall arguments; only the surviving CLI supervisor may relaunch serve.
    autoUpdater.autoRunAppAfterInstall = this.updateInstallMode === 'interactive'
    // Keep native updater diagnostics visible through local logging.
    autoUpdater.logger = createUpdaterDiagnosticLogger() as never
    const installDirectory = resolveWindowsUpdateInstallDirectory(
      process.platform,
      process.execPath
    )
    if (installDirectory) {
      // NsisUpdater reads installDirectory, which the cross-platform AppUpdater type omits.
      Object.assign(autoUpdater, { installDirectory })
    }

    // Security: never re-add a verifyUpdateCodeSignature override — a no-op disables electron-updater's built-in Authenticode check and accepts any installer.
    if (this.activeUpdateSource === 'release') {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: `https://github.com/${DOLPHIN_UPDATE_FEED.owner}/${DOLPHIN_UPDATE_FEED.repo}/releases/latest/download`
      })
    }
    if (this.autoUpdaterInitialized) {
      return
    }
    this.autoUpdaterInitialized = true
    autoUpdater.on('login', handleElectronUpdaterProxyLogin)

    registerAutoUpdaterHandlers({
      autoUpdater,
      clearBackgroundCheckLaunchPending: () => this.clearBackgroundCheckLaunchPending(),
      clearAvailableUpdateContext: () => this.clearAvailableUpdateContext(),
      consumeMissingManifestPrereleaseFallbackResult: () =>
        this.consumeMissingManifestPrereleaseFallbackResult(),
      getPublishingWindowLastGoodCheck: () => this.getPublishingWindowLastGoodCheck(),
      getMissingManifestPrereleaseFallbackUserInitiated: () =>
        this.getMissingManifestPrereleaseFallbackUserInitiated(),
      getCurrentStatus: () => this.currentStatus,
      getActiveUpdateCheckEventAttemptId: () => this.getActiveUpdateCheckEventAttemptId(),
      getKnownReleaseUrl: () => this.getKnownReleaseUrl(),
      getPendingInstallVersion: () => this.getPendingInstallVersion(),
      getUserInitiatedCheck: () => this.userInitiatedCheck,
      handleQuitAndInstallFailure: (error) => this.handleQuitAndInstallFailure(error),
      isQuitAndInstallHandoffActive: () => this.isQuitAndInstallHandoffActive(),
      hasInstallableDownloadedVersion: () => this.hasInstallableDownloadedVersion(),
      isLocalBuildCheck: () => this.activeUpdateSource === 'local',
      // Explicit pinned jumps may target versions older than the running build.
      isPinnedBuildCheck: () => this.isPinnedBuildActive,
      shouldHandleUpdaterErrorEvent: () => this.shouldHandleUpdaterErrorEvent(),
      clearUpdateAvailableEventPending: (attemptId) =>
        this.clearUpdateAvailableEventPending(attemptId),
      isActiveUpdateCheckAttempt: (attemptId) => this.isActiveUpdateCheckAttempt(attemptId),
      markUpdateCheckEventAttempt: () => this.markUpdateCheckEventAttempt(),
      markUpdateAvailableEventPending: (attemptId) =>
        this.markUpdateAvailableEventPending(attemptId),
      markMissingManifestPrereleaseFallbackChecking: () =>
        this.markMissingManifestPrereleaseFallbackChecking(),
      performQuitAndInstall: () => this.performQuitAndInstall(),
      commitStagedMacInstall: () => this.commitStagedMacInstall(),
      failMacStaging: (error) => this.failMacStaging(error),
      isAwaitingMacStaging: () => this.isAwaitingMacStaging(),
      isMacStagingDeferredToInstall: () => this.isMacStagingDeferredToInstall(),
      shouldDeferMacQuitForInstall: () => this.updateInstallMode === 'interactive',
      recordCompletedUpdateCheck: () => this.recordCompletedUpdateCheck(),
      restoreReleaseUpdateSource: () => this.restoreReleaseUpdateSource(),
      sendCheckFailureStatus: (message, userInitiated, source, sourceError) =>
        this.sendCheckFailureStatus(message, userInitiated, source, sourceError),
      sendErrorStatus: (message, userInitiated) => this.sendErrorStatus(message, userInitiated),
      sendStatus: (status) => this.sendStatus(status),
      scheduleAutomaticUpdateCheck: (delayMs) => this.scheduleAutomaticUpdateCheck(delayMs),
      shouldSuppressMissingManifestPrereleaseFallbackEvent: (message, error) =>
        this.shouldSuppressMissingManifestPrereleaseFallbackEvent(message, error),
      suppressMissingManifestPrereleaseFallbackPromiseFailure: (message) =>
        this.suppressMissingManifestPrereleaseFallbackPromiseFailure(message),
      setAvailableReleaseUrl: (releaseUrl) => {
        this.availableReleaseUrl = releaseUrl
      },
      setAvailableVersion: (version) => {
        this.availableVersion = version
      },
      setUserInitiatedCheck: (value) => {
        this.userInitiatedCheck = value
      }
    })

    void this.checkForUpdateNudge()
    this.scheduleUpdateNudgeCheck()

    const checkDailyOnWake = () => {
      void this.checkForUpdateNudge()
      if (
        this.backgroundCheckLaunchPending ||
        this.currentStatus.state === 'checking' ||
        this.currentStatus.state === 'downloading'
      ) {
        return
      }
      const lastCheck = this._getLastUpdateCheckAt?.() ?? null
      const msSince = lastCheck === null ? Number.POSITIVE_INFINITY : Date.now() - lastCheck
      if (msSince >= AUTO_UPDATE_CHECK_INTERVAL_MS) {
        this.runBackgroundUpdateCheck()
        this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
      }
    }
    powerMonitor.on('resume', checkDailyOnWake)
    app.on('browser-window-focus', checkDailyOnWake)

    const lastUpdateCheckAt = opts?.getLastUpdateCheckAt?.() ?? null
    const msSinceLastCheck =
      lastUpdateCheckAt === null ? Number.POSITIVE_INFINITY : Date.now() - lastUpdateCheckAt
    if (msSinceLastCheck >= AUTO_UPDATE_CHECK_INTERVAL_MS) {
      this.runBackgroundUpdateCheck()
      this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS)
    } else {
      this.scheduleAutomaticUpdateCheck(AUTO_UPDATE_CHECK_INTERVAL_MS - msSinceLastCheck)
    }
  }
}
