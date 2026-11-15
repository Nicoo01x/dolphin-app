import { app } from 'electron'
import { join } from 'node:path'

let dolphinProfileDirectory: string | null = null

/** Browser profile ids repeat across Dolphin profiles ("default"), so their extension data lives per Dolphin profile. */
export function configureBrowserExtensionProfileDataDirectory(profileDirectory: string): void {
  dolphinProfileDirectory = profileDirectory
}

/** Root of the per-browser-profile extension stores (sync storage, grants and state, DNR). */
export function getBrowserExtensionProfileDataDirectory(): string {
  return join(dolphinProfileDirectory ?? app.getPath('userData'), 'browser-extensions')
}
