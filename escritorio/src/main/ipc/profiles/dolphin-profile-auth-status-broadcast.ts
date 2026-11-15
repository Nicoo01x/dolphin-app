import { BrowserWindow } from 'electron'
import {
  DOLPHIN_PROFILE_AUTH_STATUS_CHANGED_CHANNEL,
  DOLPHIN_PROFILE_SIGN_IN_PROGRESS_CHANGED_CHANNEL,
  type DolphinCloudSignInProgress
} from '../../../shared/dolphin-profiles'

function broadcast(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    try {
      window.webContents.send(channel, ...args)
    } catch {
      // A renderer can disappear between isDestroyed() and send().
    }
  }
}

export function broadcastDolphinProfileAuthStatusChanged(): void {
  broadcast(DOLPHIN_PROFILE_AUTH_STATUS_CHANGED_CHANNEL)
}

export function broadcastDolphinProfileSignInProgressChanged(
  progress: DolphinCloudSignInProgress | null
): void {
  broadcast(DOLPHIN_PROFILE_SIGN_IN_PROGRESS_CHANGED_CHANNEL, progress)
}
