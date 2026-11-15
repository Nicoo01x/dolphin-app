/**
 * Lets a WSL distro stop once its dolphind idle-stops with nothing left to keep (R40). The desktop's
 * holder keeps the distro up; it reads this request and ends after dolphind's pid exits.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { DOLPHIND_WSL_HOLDER_RELEASE_FILENAME } from '../../shared/dolphind-idle-exit'
import { writeSecureFile } from '../../shared/secure-storage/secure-file'
import { DOLPHIND_WSL_HOST_ENV } from '../ipc/wsl-guest-windows-drive-path'
import type { DolphindDaemonRetirement } from './dolphind-daemon-retirement'

export function dolphindWslHolderReleasePath(userDataPath: string): string {
  return join(userDataPath, DOLPHIND_WSL_HOLDER_RELEASE_FILENAME)
}

/**
 * Only a WSL-host launch has a holder, and only a daemon that proved itself empty and left shows
 * no terminal would die with the distro. Why the launch marker: a setsid'd dolphind may lack WSL_DISTRO_NAME.
 */
export function idleStopMayReleaseWslHolder(
  env: NodeJS.ProcessEnv,
  daemon: DolphindDaemonRetirement
): boolean {
  return env[DOLPHIND_WSL_HOST_ENV] === '1' && daemon.retirement === 'retired'
}

export function requestDolphindWslHolderRelease(userDataPath: string, pid = process.pid): void {
  writeSecureFile(dolphindWslHolderReleasePath(userDataPath), `${pid}\n`)
}

/**
 * A starting dolphind may be given work, so any earlier request no longer stands. WSL-host launches
 * only; never throws, so a locked or unwritable data root cannot fail a start or a stop.
 */
export function withdrawDolphindWslHolderRelease(
  userDataPath: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (env[DOLPHIND_WSL_HOST_ENV] !== '1') {
    return
  }
  try {
    rmSync(dolphindWslHolderReleasePath(userDataPath), { force: true })
  } catch (error) {
    console.error('[dolphind] could not withdraw the WSL holder release request:', error)
  }
}
