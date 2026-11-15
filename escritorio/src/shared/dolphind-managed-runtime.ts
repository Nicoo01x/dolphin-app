import type { PublicKnownRuntimeEnvironment } from './remote-runtime/host-catalog/runtime-environments'
import type { DolphindTerminalCensus } from './dolphind-terminal-census'
import type { DolphindMigrationBlocker } from './dolphind-migration/dolphind-migration-preflight'
import type { DolphindMigrationSourceCutoverPhase } from './dolphind-migration/dolphind-migration-source-cutover'
import type { DolphindDaemonRetirementVerdict } from './dolphind-stop-request'
import type { SshManagedServerLinkedProject } from './ssh-types'
import type { DolphindStaleLockEvidence } from './dolphind-stale-lock-reclaim'

export const DOLPHIND_MANAGED_REMOTE_PORT = 6_768

/** Refused because terminals are, or may be, still running on the host. */
export type DolphindManagedRefusal = {
  outcome: 'refused'
  verdict: 'live' | 'unverifiable'
  code: string
  reason: string
  /** Only saved state blocks, which a confirmed "Move anyway" leaves on this desktop. */
  canLeaveBehind?: true
}

export type DolphindManagedDeferral = {
  outcome: 'deferred'
  candidateVersion: string
  code: string
  reason: string
  /** False when force cannot make the rejected lifecycle transition safe. */
  forceable?: boolean
}

/** The one deferral Update anyway may pass: counted terminals the daemon carries across. */
export const DOLPHIND_UPDATE_TERMINALS_RUNNING_CODE = 'dolphind_update_terminals_running'

/** Update anyway passes counted live-terminal deferrals, preserves version admission, and requires the confirmed incumbent build. */
export type DolphindManagedPastLiveTerminals = { incumbentVersion: string | null }

export type DolphindManagedDeployResult =
  | {
      outcome: 'created' | 'updated' | 'already-current'
      environment: PublicKnownRuntimeEnvironment
      activeVersion: string
    }
  | DolphindManagedDeferral

export type DolphindManagedRollbackResult =
  | {
      outcome: 'rolled-back'
      environment: PublicKnownRuntimeEnvironment
      activeVersion: string
      discarded: string[]
    }
  | { outcome: 'refused' | 'failed'; code: string; reason: string }

/** A recovery that needs the operator to accept restoring a snapshot over changed state. */
export const DOLPHIND_RECOVERY_CHANGED_STATE_CODE = 'dolphind_recovery_changed_state'

export type DolphindManagedRecoveryResult =
  | { outcome: 'none' }
  | { outcome: 'pending'; code: string; reason: string }
  | {
      outcome: 'recovered'
      resolution: 'committed' | 'restored-incumbent'
      activeVersion: string | null
      environment: PublicKnownRuntimeEnvironment
    }
  | DolphindManagedRefusal

/** Only a proven `exited` unlinks the server locally; anything less keeps it linked. */
export type DolphindManagedStopResult =
  | {
      outcome: 'unlinked'
      verdict: 'exited'
      environmentId: string
      sshTargetId: string
      stoppedVersion: string | null
      retirement: DolphindDaemonRetirementVerdict | null
    }
  | DolphindManagedRefusal

/** Refuse restart with live or unverifiable terminals: the daemon outlives dolphind and retains its inherited environment. */
export type DolphindManagedRestartResult =
  | { outcome: 'restarted'; environmentId: string }
  | { outcome: 'terminals-running'; liveSessions: number | null }
  | { outcome: 'not-restarted'; reason: string }

/** A dry run, or a confirmation pinned to the lock record that dry run showed. */
export type DolphindManagedStaleLockReclaimRequest =
  | { yes: false }
  | { yes: true; expectNonce: string }

/** `dolphind --reclaim-stale-lock` run on a managed host's active slot (#32177). */
export type DolphindManagedStaleLockReclaimResult =
  | {
      status: 'none' | 'eligible' | 'refused'
      message: string
      lockPath: string
      evidence?: DolphindStaleLockEvidence
    }
  /** `notRestarted` says why the server did not start again once its lock was cleared. */
  | {
      status: 'reclaimed'
      environmentId: string
      message: string
      lockPath: string
      /** The record the reclaim acted on. */
      evidence?: DolphindStaleLockEvidence
      notRestarted?: string
    }
  /** No remote reclaim occurred. reclaimWithoutPin requires manual reclaim because the host cannot pin confirmation;
   * otherwise lockPath names the lock to delete manually. */
  | { status: 'unsupported'; message: string; lockPath?: string; reclaimWithoutPin?: true }
  /** The slot runs the command but gave no answer this client understands; nothing is known. */
  | { status: 'no-answer'; message: string }
  /** Another lifecycle step holds the host; nothing changed. */
  | { status: 'busy'; message: string }

/** Forget only unlinks this desktop; an unreachable server may still run, so its verdict remains unverifiable. */
export type DolphindManagedForgetResult =
  | {
      outcome: 'forgotten'
      verdict: 'unverifiable'
      environmentId: string
      sshTargetId: string
    }
  | DolphindManagedRefusal

export type DolphindManagedCancelStopResult =
  | { outcome: 'none' }
  /** The stop was withdrawn before dolphind acted on it; the server keeps serving. */
  | { outcome: 'canceled'; activeVersion: string }
  /** dolphind had already exited; finish with stop to unlink the server. */
  | { outcome: 'already-stopped' }
  | DolphindManagedRefusal

export type DolphindManagedRuntimeStatus = {
  environmentId: string
  sshTargetId: string
  activeVersion: string | null
  previousVersion: string | null
  activatedAt: string | null
  rollbackAvailable: boolean
  recovery:
    | {
        operation: 'activate'
        phase: 'prepared' | 'incumbent-stopped' | 'snapshot-captured' | 'candidate-ready'
        version: string
        startedAt: string
      }
    | {
        operation: 'rollback'
        phase:
          | 'prepared'
          | 'incumbent-stopped'
          | 'rescue-captured'
          | 'rollback-state-restored'
          | 'target-ready'
        version: string
        startedAt: string
      }
    | {
        operation: 'decommission'
        phase: 'prepared' | 'stop-dispatched' | 'process-exited'
        version: string
        startedAt: string
      }
    | null
  /** Terminals the daemon runs; `null` counts are unverifiable and block updates and stops. */
  terminals: DolphindTerminalCensus
  /** An unfinished dormant migration into this server; a rollback is refused while it runs. */
  migration: {
    migrationId: string
    phase: DolphindMigrationSourceCutoverPhase
    startedAt: string
  } | null
  /** The last update this client deferred for this server, cleared once one goes through. */
  deferredUpdate: (DolphindManagedDeferral & { deferredAt: string }) | null
  /** The Dolphin release that activated `activeVersion`; absent when unknown or from older desktops. */
  activeAppVersion?: string | null
  /** This desktop's bundled build when Update would move the host to it; absent from older desktops. */
  availableUpdate?: string | null
}

export type DolphindManagedConversionResult =
  | {
      /** Committed on the server and retired from the SSH host. */
      outcome: 'converted'
      environment: PublicKnownRuntimeEnvironment
      migrationId: string
      /** Projects the server already held, so this desktop's own state for them did not move. */
      linkedProjects?: SshManagedServerLinkedProject[]
      /** Moved automations the server would not re-enable; they stay off there. */
      automationsLeftDisabled?: number
    }
  | DolphindManagedDeferral
  | DolphindManagedRefusal

export type DolphindManagedPendingMigrationRow = {
  migrationId: string
  environmentId: string
  name: string
  sshTargetId: string
  phase: DolphindMigrationSourceCutoverPhase
  startedAt: string
}

export type DolphindDeltaMoveRow = {
  kind: 'repository' | 'folder-workspace' | 'project-group'
  id: string
  label: string
}

/** What moving a host's newer projects would add, and what the server will keep as it is. */
export type DolphindDeltaMovePreview = {
  sshTargetId: string
  environmentId: string
  added: DolphindDeltaMoveRow[]
  /** Projects an older build changed or removed; the server keeps its own copy of these. */
  notReflected: { edited: DolphindDeltaMoveRow[]; removed: DolphindDeltaMoveRow[] }
  blockers: DolphindMigrationBlocker[]
}

export type DolphindDeltaMoveResult =
  | { outcome: 'moved'; migrationId: string }
  | { outcome: 'refused'; code: string; reason: string; blockers?: DolphindMigrationBlocker[] }
