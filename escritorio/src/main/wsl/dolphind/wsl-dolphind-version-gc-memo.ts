import {
  provenLiveDaemonVersion,
  pruneManagedDolphindVersions,
  type ManagedDolphindPruneArgs
} from '../../managed-server/lifecycle/dolphind-managed-version-gc'

// Only activating another version or a daemon change makes a dir stale; until then a clean GC stays clean.
// A distro shared with another Dolphin, or a rolled-back activation, can leave a stale dir until the next launch.
const cleanHosts = new Set<string>()

/** Skips version GC on reconnects (distro restarts) after one left nothing behind under the same pins. */
export async function pruneWslDolphindVersionsUntilClean(
  environmentId: string,
  args: ManagedDolphindPruneArgs,
  prune: (args: ManagedDolphindPruneArgs) => Promise<boolean> = pruneManagedDolphindVersions
): Promise<void> {
  const key = JSON.stringify([
    environmentId,
    args.slot.remoteHome,
    args.activeVersion,
    provenLiveDaemonVersion(args.readiness) ?? null
  ])
  if (cleanHosts.has(key)) {
    return
  }
  if (await prune(args)) {
    cleanHosts.add(key)
  }
}

export function resetWslDolphindVersionGcMemoForTests(): void {
  cleanHosts.clear()
}
