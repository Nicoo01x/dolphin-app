/** C4 recovery uses bounded relaunch backoff, then census before publishing terminal verdicts. Recovery is never a user action, so it needs a confirmed-running distro and never boots one (E9). */
import type { DolphindTerminalCensus } from '../../../shared/dolphind-terminal-census'
import { wslHostStatusDetailText } from '../../../shared/wsl-host-failure-copy'
import type { WslRunningDistrosRead } from '../discovery/wsl-background-distro-gate'
import { wslDistroHolderKey } from '../discovery/wsl-distro-holder-record'
import type { WslDolphindConnection } from './wsl-dolphind-connection-types'
import type { WslDolphindConnectOptions } from './wsl-dolphind-connection'
import type { WslDolphindConnectionStatus } from './wsl-dolphind-connection-status'
import type { WslLivenessVerdict } from './wsl-dolphind-liveness-verdict'
import type { WslDolphindReconnectBackoff } from './wsl-dolphind-reconnect-backoff'

export type WslDolphindRecoveryReason = 'dolphind-exited' | 'distro-restarted' | 'distro-stopped'

export type WslDolphindRecoveryContext = {
  distro: string
  backoff: WslDolphindReconnectBackoff
  now: () => number
  /** False once the distro stopped being supervised or a newer recovery took over. */
  current: () => boolean
  wait: (delayMs: number) => Promise<void>
  publish: (status: WslDolphindConnectionStatus) => void
  ensure: (options: WslDolphindConnectOptions) => Promise<WslDolphindConnection>
  collectCensus: (connection: WslDolphindConnection) => Promise<DolphindTerminalCensus>
  /** Records the new dolphind's identity and holds a fresh watch. */
  arm: (connection: WslDolphindConnection) => Promise<void>
  readRunning: () => Promise<WslRunningDistrosRead>
}

/** Ends ready, failed, or with the verdict the background gate found instead (returned). */
export async function recoverWslDolphind(
  context: WslDolphindRecoveryContext,
  reason: WslDolphindRecoveryReason
): Promise<WslLivenessVerdict | null> {
  const terminals = reason === 'dolphind-exited' ? 'unverifiable' : 'exited'
  for (;;) {
    const decision = context.backoff.next(context.now())
    if (decision.kind === 'give-up') {
      const gaveUp = wslHostStatusDetailText('restartGaveUp', {
        distro: context.distro,
        count: decision.attempts
      })
      context.publish({
        state: 'failed',
        reason: gaveUp.text,
        reasonCode: gaveUp.code,
        reasonParams: gaveUp.params,
        terminals
      })
      return null
    }
    const reconnecting = {
      state: 'reconnecting',
      reason,
      attempt: decision.attempt,
      terminals
    } as const
    context.publish({ ...reconnecting, retryInMs: decision.delayMs })
    await context.wait(decision.delayMs)
    if (!context.current()) {
      return null
    }
    const gate = backgroundRecoveryGate(await context.readRunning(), context.distro)
    if (gate || !context.current()) {
      return gate
    }
    try {
      const connection = await context.ensure({
        status: {
          pending: { ...reconnecting, retryInMs: null },
          ready: { ...reconnecting, reason: 'census', retryInMs: null }
        }
      })
      if (!context.current()) {
        return null
      }
      // Recount before marking terminals; the daemon may have preserved all sessions across dolphind loss.
      const census = await context.collectCensus(connection)
      await context.arm(connection)
      if (context.current()) {
        context.publish({ state: 'ready', census })
      }
      return null
    } catch (error) {
      console.warn(
        `[wsl] reconnect to ${context.distro} failed:`,
        error instanceof Error ? error.message : error
      )
      if (!context.current()) {
        return null
      }
    }
  }
}

/** null lets a background recovery go ahead: the distro is confirmed running. */
export function backgroundRecoveryGate(
  running: WslRunningDistrosRead,
  distro: string
): WslLivenessVerdict | null {
  if (running.status !== 'confirmed') {
    return { kind: 'unverifiable', reason: 'running-list-unavailable' }
  }
  const key = wslDistroHolderKey(distro)
  return running.distros.some((candidate) => wslDistroHolderKey(candidate) === key)
    ? null
    : { kind: 'distro-stopped', corroborated: false }
}
