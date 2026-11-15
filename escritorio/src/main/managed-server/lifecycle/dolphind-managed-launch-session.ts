import { randomUUID } from 'node:crypto'
import type { DolphindManagedRestartResult } from '../../../shared/dolphind-managed-runtime'
import {
  withDolphindActivationLock,
  type DolphindActivationLockControl
} from '../activation/dolphind-activation-lock'
import { readDolphindActivationRecord } from '../activation/dolphind-activation-record-store'
import {
  dolphindLaunchSshSessionProbeCommand,
  parseDolphindLaunchSshSession,
  recordsDolphindLaunchSshSession,
  type DolphindLaunchSshSession
} from '../install/dolphind-launch-ssh-session'
import { withManagedDolphindLifecycle } from './dolphind-managed-lifecycle'
import {
  managedDolphindInstallDir,
  managedDolphindSlot,
  requireManagedDolphindEnvironment,
  requireManagedDolphindInfrastructure,
  resolveLinkedDolphindContext
} from './dolphind-managed-runtime-context'
import { resolveDolphindRemoteContext } from '../install/dolphind-remote-context'

import { rebuildDolphindManagedTunnel } from './dolphind-managed-tunnel'
import { wakeStoppedManagedDolphind } from './dolphind-managed-wake'
import { readRemoteDolphindManagedStopTarget } from './dolphind-managed-remote-stop'
import { dolphindSlotDir, type DolphindSlotOptions } from '../activation/dolphind-recovery-slot'
import { stopIncumbentBehindTerminalBarrier } from './dolphind-rollback-terminal-barrier'
import { execDolphindRemote } from '../install/dolphind-remote-runtime-control'
import { collectManagedTerminalCensus } from './dolphind-terminal-census-client'
import { runFencedStop, updateTerminalCounts } from '../activation/dolphind-fenced-stop'

export async function readManagedDolphindLaunchSshSession(
  userDataPath: string,
  environmentId: string
): Promise<DolphindLaunchSshSession> {
  const { deployment } = requireManagedDolphindEnvironment(userDataPath, environmentId)
  const { connectionManager, targetStore } = requireManagedDolphindInfrastructure()
  const target = targetStore.getTarget(deployment.sshTargetId)
  // Background checks must not reconnect hosts the user left.
  const connection =
    target && connectionManager.getState(target.id)?.status === 'connected'
      ? (connectionManager.getConnection(target.id) ?? null)
      : null
  if (!target || !connection) {
    return 'unverifiable'
  }
  const context = await resolveDolphindRemoteContext(target, connection)
  if (!recordsDolphindLaunchSshSession(context.host)) {
    return 'not-applicable'
  }
  const active = context.activationRecord.active
  if (!active) {
    return 'not-recorded'
  }
  return parseDolphindLaunchSshSession(
    await execDolphindRemote(
      { conn: context.connection, host: context.host },
      dolphindLaunchSshSessionProbeCommand(
        context.host,
        managedDolphindInstallDir(context, active),
        context.userDataDir
      )
    )
  )
}

/** Restart only without terminals: surviving daemons retain the old SSH-session attribution. */
export function restartManagedDolphindEnvironment(
  userDataPath: string,
  selector: string
): Promise<DolphindManagedRestartResult> {
  return withManagedDolphindLifecycle(
    userDataPath,
    selector,
    async ({ environment, deployment }) => {
      const context = await resolveLinkedDolphindContext(environment, deployment)
      if (!context.activationRecord.active) {
        return { outcome: 'not-restarted', reason: 'This host has no activated Dolphin server.' }
      }
      const counts = updateTerminalCounts((options) =>
        collectManagedTerminalCensus(
          userDataPath,
          environment,
          context.activationRecord,
          undefined,
          options
        )
      )
      // Unfenced: a host with terminals is refused before anything waits on its lock.
      const census = await counts.countFirst()
      if (census.liveSessions !== 0) {
        return { outcome: 'terminals-running', liveSessions: census.liveSessions }
      }
      const slot = managedDolphindSlot(context, deployment.remotePort)
      const stopped = await withDolphindActivationLock(
        slot,
        (lock) => recountThenStop(slot, lock, counts),
        (): StopOutcome => ({
          state: 'kept',
          reason: 'An update, rollback or recovery holds this host; try again when it finishes.'
        })
      )
      if (stopped.state === 'terminals-running') {
        return { outcome: 'terminals-running', liveSessions: stopped.liveSessions }
      }
      if (stopped.state === 'kept') {
        return { outcome: 'not-restarted', reason: stopped.reason }
      }
      // Started even when the daemon stayed: a stopped server serves nothing.
      const wake = await wakeStoppedManagedDolphind(slot)
      if (wake.outcome !== 'started' && wake.outcome !== 'serving') {
        return {
          outcome: 'not-restarted',
          reason:
            wake.outcome === 'recovery-refused'
              ? wake.reason
              : `This host’s Dolphin server stopped but did not start again (${wake.outcome}); reconnect to start it.`
        }
      }
      // The started server may have bound another port than the forward in use.
      await rebuildDolphindManagedTunnel(userDataPath, environment.id)
      const dir = dolphindSlotDir(slot, stopped.version)
      if (stopped.state === 'daemon-kept') {
        // The launch carried the ended session forward, so later connects keep the warning.
        return { outcome: 'not-restarted', reason: stopped.reason }
      }
      const session = parseDolphindLaunchSshSession(
        await execDolphindRemote(
          slot,
          dolphindLaunchSshSessionProbeCommand(slot.host, dir, slot.userDataDir)
        )
      )
      if (session === 'exited') {
        return {
          outcome: 'not-restarted',
          reason:
            'This host’s Dolphin server restarted, but its terminals still belong to an SSH session ' +
            'that has ended: its terminal daemon was still running, or this connection opens a ' +
            'new SSH session for each command. Turn on SSH connection reuse for this host if ' +
            'it is off, then restart again.'
        }
      }
      return { outcome: 'restarted', environmentId: environment.id }
    }
  )
}

type StopOutcome =
  | { state: 'retired'; version: string }
  /** The surviving daemon still spawns terminals with old attribution. */
  | { state: 'daemon-kept'; version: string; reason: string }
  /** Serving or possibly stopping; do not start another instance. */
  | { state: 'kept'; reason: string; mayBeStopping?: true }
  | { state: 'terminals-running'; liveSessions: number | null }

/** Only the host lock holder may close/reopen admission, preserving other runs' fences. */
async function recountThenStop(
  slot: DolphindSlotOptions,
  lock: DolphindActivationLockControl,
  counts: ReturnType<typeof updateTerminalCounts>
): Promise<StopOutcome> {
  const fenced = await runFencedStop({
    ...counts,
    now: Date.now,
    refuse: (census): StopOutcome | null =>
      census.liveSessions === 0
        ? null
        : { state: 'terminals-running', liveSessions: census.liveSessions },
    stale: (): StopOutcome => STALE_COUNT,
    stop: (stillFenced) => stopRetiringIdleDaemon(slot, lock, stillFenced),
    // Woken servers start with admission open; only unsent stops need reopening.
    stopMayHaveBeenSent: (outcome) =>
      outcome.state === 'retired' ||
      outcome.state === 'daemon-kept' ||
      (outcome.state === 'kept' && outcome.mayBeStopping === true)
  })
  return 'refused' in fenced ? fenced.refused : fenced.stopped
}

const STALE_COUNT: StopOutcome = {
  state: 'kept',
  reason: 'The terminal count went stale before the stop. Restart again.'
}

async function stopRetiringIdleDaemon(
  slot: DolphindSlotOptions,
  lock: DolphindActivationLockControl,
  stillFenced: () => boolean
): Promise<StopOutcome> {
  // Other clients may change the active slot; reread under the fence.
  const active = (await readDolphindActivationRecord(slot)).active
  if (!active) {
    return { state: 'kept', reason: 'This host has no activated Dolphin server.' }
  }
  const target = await readRemoteDolphindManagedStopTarget(slot, active)
  if (target.state === 'refused') {
    return { state: 'kept', reason: target.reason }
  }
  // Expired census fences may have admitted terminals; do not stop after expiry.
  if (!stillFenced()) {
    return STALE_COUNT
  }
  const barrier = await stopIncumbentBehindTerminalBarrier(slot, randomUUID(), target.context)
  switch (barrier.state) {
    case 'retired':
      return { state: 'retired', version: active }
    case 'unproven':
      return {
        state: 'daemon-kept',
        version: active,
        reason:
          'This host’s Dolphin server restarted, but its terminal daemon kept running because a terminal ' +
          'was open at the stop, so terminals may still lack local network access.'
      }
    case 'unsettled':
      // Recovery must retain the fence while dolphind may still be stopping.
      lock.retain()
      return { state: 'kept', reason: barrier.reason, mayBeStopping: true }
    case 'withdrawn':
      return { state: 'kept', reason: barrier.reason }
  }
}
