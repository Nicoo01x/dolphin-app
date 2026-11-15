import type { NodeRuntimeTarget } from '../../../shared/node-runtime-pin'
import type { ServeReadiness } from '../../server/serve-readiness'
import { readDolphindActivationRecord } from '../activation/dolphind-activation-record-store'
import {
  dolphindSlotDir,
  resolveDolphindSlotIdentity,
  type DolphindSlotOptions
} from '../activation/dolphind-recovery-slot'
import { probeActiveDolphindReadiness } from '../activation/dolphind-active-readiness'
import { gcOldDolphindVersions } from '../install/dolphind-remote-gc'
import { nodeRuntimeStorePins } from '../install/pinned-runtime-host-target'

/** null proves no daemon; undefined means its version is unknown. */
export function provenLiveDaemonVersion(readiness: ServeReadiness): string | null | undefined {
  const daemon = readiness.health?.terminalDaemon
  if (daemon?.state === 'live' && daemon.buildVersion) {
    return daemon.buildVersion
  }
  return daemon?.state === 'absent' ? null : undefined
}

export type ManagedDolphindPruneArgs = {
  slot: DolphindSlotOptions
  serverTarget: NodeRuntimeTarget
  activeVersion: string
  readiness: ServeReadiness
  keepStagedWithinDays?: number
}

/** True only when GC ran and left no stale version dir behind. */
export async function pruneManagedDolphindVersions(args: ManagedDolphindPruneArgs): Promise<boolean> {
  const liveDaemonVersion = provenLiveDaemonVersion(args.readiness)
  // Unknown daemon versions could still execute from any candidate tree; skip GC.
  if (liveDaemonVersion === undefined) {
    return false
  }
  try {
    return await gcOldDolphindVersions({
      conn: args.slot.conn,
      host: args.slot.host,
      remoteHome: args.slot.remoteHome,
      currentDirAbsPath: dolphindSlotDir(args.slot, args.activeVersion),
      record: await readDolphindActivationRecord(args.slot),
      liveDaemonVersion,
      // Default and compat builds share one runtime store.
      nodeRuntimePins: nodeRuntimeStorePins(args.serverTarget),
      ...(args.keepStagedWithinDays !== undefined
        ? { keepStagedWithinDays: args.keepStagedWithinDays }
        : {}),
      signal: args.slot.signal
    })
  } catch (error) {
    // Cleanup must not fail completed deploys; later connects retry.
    console.warn('[dolphind-gc] Pruning old dolphind versions failed:', error)
    return false
  }
}

/** GC otherwise runs only after an activation, so each deferred release left its staged slot behind (#34149). */
export async function pruneSupersededDolphindCandidates(
  slot: DolphindSlotOptions,
  serverTarget: NodeRuntimeTarget,
  candidateVersion: string
): Promise<void> {
  let readiness: ServeReadiness
  try {
    const active = (await readDolphindActivationRecord(slot)).active
    if (!active) {
      return
    }
    readiness = await probeDolphindSlotReadiness(slot, active)
  } catch (error) {
    // Without the incumbent's daemon version a staged tree may still be executing.
    console.warn('[dolphind-gc] Skipped pruning staged dolphind versions:', error)
    return
  }
  await pruneManagedDolphindVersions({
    slot,
    serverTarget,
    activeVersion: candidateVersion,
    readiness,
    keepStagedWithinDays: STAGED_BUILD_KEEP_DAYS
  })
}

/** Readiness of the dolphind serving `version`, which names its live terminal daemon's build. */
export async function probeDolphindSlotReadiness(
  slot: DolphindSlotOptions,
  version: string
): Promise<ServeReadiness> {
  const identity = await resolveDolphindSlotIdentity(slot, version)
  return probeActiveDolphindReadiness(
    { ...slot, remoteInstallDir: identity.remoteDir },
    { buildHash: identity.buildHash, fullVersion: identity.version }
  )
}

// Desktops on different releases share hosts; without a grace period each re-uploads what the other pruned.
const STAGED_BUILD_KEEP_DAYS = 3
