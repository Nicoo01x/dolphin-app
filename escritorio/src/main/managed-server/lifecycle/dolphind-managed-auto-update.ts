import {
  planManagedDolphindAutoUpdate,
  type ManagedDolphindAutoUpdateSkip
} from './dolphind-managed-update-decision'
import { DolphindCrashLoopError } from './dolphind-managed-crash-loop'
import { materializeDolphindArtifact } from '../../dolphind/dolphind-artifact-materializer'
import {
  DolphindArtifactsUnavailableError,
  DolphindHostUnsupportedError
} from '../../dolphind/dolphind-host-unavailable'
import { findIncompleteManagedDolphindMigration } from './dolphind-managed-migration-status'
import { DOLPHIND_ACTIVATION_FENCE_BUSY_CODE } from '../activation/dolphind-activation-fence-hold'
import { resolveLinkedDolphindContext } from './dolphind-managed-runtime-context'
import { runManagedDolphindUpdate } from './dolphind-runtime-maintenance'
import { withManagedDolphindLifecycle } from './dolphind-managed-lifecycle'
import type { DolphindUpdateDeferCode } from '../activation/dolphind-update-plan'
import { readLocalFullVersion } from '../install/remote-versioned-install'

export type ManagedDolphindAutoUpdateOutcome =
  | { outcome: 'skipped'; reason: ManagedDolphindAutoUpdateSkip }
  | { outcome: 'updated'; activeVersion: string }
  | { outcome: 'deferred'; code: string; reason: string }
  /** Candidate rejection or update failure; consult host state before assuming the incumbent serves. */
  | { outcome: 'failed'; reason: string }

const WAITING_CODES: ReadonlySet<string> = new Set<
  DolphindUpdateDeferCode | typeof DOLPHIND_ACTIVATION_FENCE_BUSY_CODE
>([
  DOLPHIND_ACTIVATION_FENCE_BUSY_CODE,
  'dolphind_update_terminals_running',
  'dolphind_update_terminal_census_unavailable',
  'dolphind_update_strands_live_terminals',
  'dolphind_update_daemon_protocol_unverifiable',
  'dolphind_update_ends_in_process_terminals'
])

/** Temporary deferrals retry on later connects; interrupted activations require recovery. */
export function isWaitingDolphindUpdateDeferral(code: string): boolean {
  return WAITING_CODES.has(code)
}

export function autoUpdateManagedDolphindEnvironment(
  userDataPath: string,
  args: {
    environmentId: string
    appVersion: string
    /** Read under the lifecycle lock to observe prior overlapping attempts. */
    failedBefore: () => boolean
    onUpdating: () => void
  }
): Promise<ManagedDolphindAutoUpdateOutcome> {
  return withManagedDolphindLifecycle(userDataPath, args.environmentId, async (managed) => {
    // Restarting during migration would race cutover staging.
    if (findIncompleteManagedDolphindMigration(userDataPath, managed.environment.id)) {
      return { outcome: 'skipped', reason: 'migrating' }
    }
    const context = await resolveLinkedDolphindContext(managed.environment, managed.deployment)
    const candidateVersion = await bundledManagedDolphindVersion(context.serverTarget)
    const plan = planManagedDolphindAutoUpdate({
      record: context.activationRecord,
      candidateVersion,
      appVersion: args.appVersion,
      failedBefore: args.failedBefore()
    })
    if (plan.action === 'skip') {
      return { outcome: 'skipped', reason: plan.reason }
    }
    args.onUpdating()
    let lockedSkip: ManagedDolphindAutoUpdateSkip | null = null
    try {
      const result = await runManagedDolphindUpdate(userDataPath, managed, context, {
        // Another desktop may activate or stop a newer build during upload; recheck under the fence.
        admitRecord: (record) => {
          const locked = planManagedDolphindAutoUpdate({
            record,
            candidateVersion,
            appVersion: args.appVersion,
            failedBefore: false
          })
          if (locked.action === 'update') {
            return null
          }
          lockedSkip = locked.reason
          return `Auto-update skipped under the host fence: ${locked.reason}.`
        }
      })
      if (lockedSkip) {
        return { outcome: 'skipped', reason: lockedSkip }
      }
      if (result.outcome !== 'deferred') {
        return { outcome: 'updated', activeVersion: result.activeVersion }
      }
      return isWaitingDolphindUpdateDeferral(result.code)
        ? { outcome: 'deferred', code: result.code, reason: result.reason }
        : { outcome: 'failed', reason: result.reason }
    } catch (error) {
      // The host already runs this build; the brake's reason shows on its server status instead.
      if (error instanceof DolphindCrashLoopError) {
        return { outcome: 'skipped', reason: 'current' }
      }
      return { outcome: 'failed', reason: error instanceof Error ? error.message : String(error) }
    }
  })
}

type DolphindTarget = Parameters<typeof materializeDolphindArtifact>[0]

// Packaged templates cannot change during this session; avoid repeated hashing.
const bundledVersions = new Map<DolphindTarget, Promise<string | null>>()

/** This build's dolphind version for `target`; null when the build bundles none for it. */
export function bundledManagedDolphindVersion(target: DolphindTarget): Promise<string | null> {
  let version = bundledVersions.get(target)
  if (!version) {
    version = materializeDolphindArtifact(target).then(readLocalFullVersion, (error: unknown) => {
      if (
        error instanceof DolphindHostUnsupportedError ||
        error instanceof DolphindArtifactsUnavailableError
      ) {
        return null
      }
      throw error
    })
    // A transient local failure must not stick for the session.
    version.catch(() => bundledVersions.delete(target))
    bundledVersions.set(target, version)
  }
  return version
}

export function resetBundledDolphindVersionsForTests(): void {
  bundledVersions.clear()
}
