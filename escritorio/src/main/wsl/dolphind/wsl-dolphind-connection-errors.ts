import type { WslRunningDistrosRead } from '../discovery/wsl-background-distro-gate'
import { wslDistroHolderKey } from '../discovery/wsl-distro-holder-record'
import type { WslDolphindLaunch } from './wsl-dolphind-launch-contract'
import { confirmsRunning } from './wsl-dolphind-liveness-evidence'

type WslDolphindDeferredLaunch = Extract<WslDolphindLaunch, { outcome: 'deferred' }>

/** dolphind installed an update it may not activate yet (live terminals); nothing is listening. */
export class WslDolphindLaunchDeferredError extends Error {
  constructor(readonly launch: WslDolphindDeferredLaunch) {
    super(launch.reason)
    this.name = 'WslDolphindLaunchDeferredError'
  }
}

/** A no-boot reconnect found the distro not confirmed running, so nothing was started. */
export class WslDistroNotRunningError extends Error {
  constructor(distro: string) {
    super(
      `The WSL distro ${distro} isn’t running, so Dolphin didn’t start it for a background request.`
    )
    this.name = 'WslDistroNotRunningError'
  }
}

/** A no-boot gate couldn't read WSL's running list: nothing was started, and the verdict is open. */
export class WslDistroUnverifiableConnectError extends Error {
  constructor(distro: string) {
    super(
      `WSL didn’t answer whether ${distro} is running, so Dolphin didn’t start anything there yet.`
    )
    this.name = 'WslDistroUnverifiableConnectError'
  }
}

/** True only for a confirmed running read; an unreadable list throws, never reading as "not running". */
export function requireConfirmedRunning(running: WslRunningDistrosRead, distro: string): boolean {
  if (running.status !== 'confirmed') {
    throw new WslDistroUnverifiableConnectError(distro)
  }
  return confirmsRunning(running, wslDistroHolderKey(distro))
}

export class WslDolphindConnectionSupersededError extends Error {
  constructor(distro: string) {
    super(`The connection to the WSL distro ${distro} was closed while it was being opened.`)
    this.name = 'WslDolphindConnectionSupersededError'
  }
}

/** A no-boot connect re-reads the running list just before anything spawns in the distro. */
export async function assertWslDistroMayStart(
  distro: string,
  requireRunning: ((distro: string) => Promise<boolean>) | undefined,
  isCurrent: () => boolean
): Promise<void> {
  if (!requireRunning) {
    return
  }
  const running = await requireRunning(distro)
  // A close during the read supersedes this connect before it deploys anything.
  if (!isCurrent()) {
    throw new WslDolphindConnectionSupersededError(distro)
  }
  if (!running) {
    throw new WslDistroNotRunningError(distro)
  }
}

/** A no-boot gate refused before anything spawned: stopped, or the running list was unreadable. */
export function isNoBootRefusal(error: unknown): boolean {
  return (
    error instanceof WslDistroNotRunningError || error instanceof WslDistroUnverifiableConnectError
  )
}

/** Failures the connection's status must not report as `failed`: liveness owns those verdicts. */
export function isQuietConnectFailure(error: unknown): boolean {
  return error instanceof WslDolphindConnectionSupersededError || isNoBootRefusal(error)
}
