import { getAppEnvironment, hasAppEnvironment } from './app-environment'

export function getDolphinCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'linux') {
    return 'dolphin'
  }
  if (platform === 'win32') {
    return 'dolphin.cmd'
  }
  return 'dolphin'
}

/** The GNOME-conflict `dolphin-ide` rename is desktop-only: SSH relays and headless Dolphin servers put plain `dolphin` on PATH. */
export function skipsLinuxDolphinCliRename(isRemote: boolean | undefined): boolean {
  if (isRemote) {
    return true
  }
  // Only a headless server publishes its own launcher; Windows ones (WSL launches) keep the rename.
  const launcher = hasAppEnvironment() ? getAppEnvironment().getCliLauncherPath?.() : null
  return launcher?.endsWith('/dolphin') ?? false
}
