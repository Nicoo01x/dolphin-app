import {
  cancelManagedDolphindStop,
  forgetManagedDolphindEnvironment,
  forgetRedundantManagedDolphindEnvironment,
  stopManagedDolphindEnvironment
} from '../../managed-server/lifecycle/dolphind-runtime-decommission'
import { getManagedDolphindRuntimeStatus } from '../../managed-server/lifecycle/dolphind-runtime-status'
import { recoverManagedDolphindEnvironment } from '../../managed-server/lifecycle/dolphind-managed-recovery'
import { rollbackManagedDolphindEnvironment } from '../../managed-server/lifecycle/dolphind-managed-rollback'
import { updateManagedDolphindEnvironment } from '../../managed-server/lifecycle/dolphind-runtime-maintenance'
import { getDolphindSshDeployment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import type {
  DolphindManagedRestartResult,
  DolphindManagedStaleLockReclaimRequest,
  DolphindManagedStaleLockReclaimResult
} from '../../../shared/dolphind-managed-runtime'
import { restartManagedDolphindEnvironment } from '../../managed-server/lifecycle/dolphind-managed-launch-session'
import { forgetManagedDolphindAutomaticFailures } from '../../managed-server/lifecycle/dolphind-managed-tunnel'
import { runManagedDolphindStaleLockReclaim } from '../../managed-server/lifecycle/dolphind-managed-stale-lock-reclaim'
import { clearLaunchSessionNote } from './runtime-environment-managed-tunnel'
import { forgetLaunchSessionVerdict } from '../ssh/ssh-host-launch-session-note'
import {
  liftUserHoldsForServerAction,
  resumeRuntimeEnvironmentStatus
} from '../ssh/ssh-host-user-disconnect'
import { releaseUnlinkedHostTransport } from '../ssh/ssh-session-teardown'
import type { ManagedServerActions } from '../../runtime/hosts/management/managed-server-actions-registry'
import {
  retireRemovedRuntimeEnvironment,
  type RemovedServerStore
} from './runtime-environment-removal-cleanup'

export type ManagedDolphindActionOptions = {
  getUserDataPath: () => string
  getActiveEnvironmentId: () => string | null | undefined
  invalidateTransport: (environmentId: string) => Promise<void> | void
  clearHostServerNotes: (sshTargetId: string, environmentId: string) => void
  clearHostServerStatus: (sshTargetId: string) => void
  store: RemovedServerStore
}

export function createManagedDolphindActions(
  options: ManagedDolphindActionOptions
): ManagedServerActions {
  const userDataPath = options.getUserDataPath
  const unlinkPolicy = {
    isActiveEnvironment: (environmentId: string) =>
      options.getActiveEnvironmentId() === environmentId,
    retireLocalState: (environmentId: string) =>
      retireRemovedRuntimeEnvironment(
        environmentId,
        options.invalidateTransport,
        options.store,
        userDataPath()
      ),
    releaseHostTransport: releaseUnlinkedHostTransport
  }
  return {
    status: (selector) => getManagedDolphindRuntimeStatus(userDataPath(), selector),
    update: (selector, force, pastLiveTerminals) =>
      asExplicitServerAction(userDataPath(), selector, async () => {
        const result = await updateManagedDolphindEnvironment(userDataPath(), {
          selector,
          force,
          ...(pastLiveTerminals ? { pastLiveTerminals } : {})
        })
        if (result.outcome === 'updated') {
          await options.invalidateTransport(result.environment.id)
        }
        if (result.outcome !== 'deferred') {
          const targetId = getDolphindSshDeployment(result.environment)?.sshTargetId
          if (targetId) {
            options.clearHostServerNotes(targetId, result.environment.id)
          }
        }
        return result
      }),
    rollback: (selector) =>
      asExplicitServerAction(userDataPath(), selector, async () => {
        const result = await rollbackManagedDolphindEnvironment(userDataPath(), { selector })
        if (result.outcome === 'rolled-back') {
          await options.invalidateTransport(result.environment.id)
        }
        return result
      }),
    recover: (selector, acceptChangedState) =>
      asExplicitServerAction(userDataPath(), selector, async () => {
        const result = await recoverManagedDolphindEnvironment(userDataPath(), {
          selector,
          acceptChangedState: acceptChangedState === true
        })
        if (result.outcome === 'recovered' && result.activeVersion) {
          await options.invalidateTransport(result.environment.id)
        }
        return result
      }),
    stop: async (selector) => {
      const result = await stopManagedDolphindEnvironment(
        userDataPath(),
        { selector },
        unlinkPolicy
      )
      if (result.outcome === 'unlinked') {
        options.clearHostServerStatus(result.sshTargetId)
      }
      return result
    },
    cancelStop: (selector) => cancelManagedDolphindStop(userDataPath(), { selector }),
    forget: async (selector) => {
      const result = await forgetManagedDolphindEnvironment(
        userDataPath(),
        { selector },
        unlinkPolicy
      )
      if (result.outcome === 'forgotten') {
        options.clearHostServerStatus(result.sshTargetId)
      }
      return result
    },
    forgetRedundant: async (selector) => {
      const result = await forgetRedundantManagedDolphindEnvironment(
        userDataPath(),
        { selector },
        unlinkPolicy
      )
      if (result.outcome === 'forgotten') {
        options.clearHostServerStatus(result.sshTargetId)
      }
      return result
    }
  }
}

export async function restartManagedDolphind(
  options: ManagedDolphindActionOptions,
  selector: string
): Promise<DolphindManagedRestartResult> {
  return asExplicitServerAction(options.getUserDataPath(), selector, async () => {
    const result = await restartManagedDolphindEnvironment(options.getUserDataPath(), selector)
    if (result.outcome === 'restarted') {
      await reconnectRestartedManagedDolphind(options, result.environmentId)
    }
    return result
  })
}

export async function reclaimManagedDolphindStaleLock(
  options: ManagedDolphindActionOptions,
  selector: string,
  request: DolphindManagedStaleLockReclaimRequest
): Promise<DolphindManagedStaleLockReclaimResult> {
  const result = await runManagedDolphindStaleLockReclaim(options.getUserDataPath(), selector, request)
  // Reconnect also replaces stale-lock feedback when no process had started.
  if (result.status === 'reclaimed') {
    await reconnectRestartedManagedDolphind(options, result.environmentId)
  }
  return result
}

async function reconnectRestartedManagedDolphind(
  options: ManagedDolphindActionOptions,
  environmentId: string
): Promise<void> {
  await options.invalidateTransport(environmentId)
  const environment = resolveEnvironment(options.getUserDataPath(), environmentId)
  const targetId = getDolphindSshDeployment(environment)?.sshTargetId
  if (targetId) {
    options.clearHostServerNotes(targetId, environmentId)
    forgetLaunchSessionVerdict(targetId)
    clearLaunchSessionNote(targetId, environmentId)
  }
}

/** A user's Update, Rollback, Recover or Restart is a Connect: it re-arms automatic starts and lifts a Disconnect. */
async function asExplicitServerAction<T>(
  userDataPath: string,
  selector: string,
  action: () => Promise<T>
): Promise<T> {
  let lifted: string[] = []
  try {
    const environment = resolveEnvironment(userDataPath, selector)
    forgetManagedDolphindAutomaticFailures(userDataPath, environment.id)
    lifted = liftUserHoldsForServerAction(environment)
  } catch {
    // An unknown selector fails in the action itself with its own error.
  }
  try {
    // `action` includes its transport invalidation, so resumed status never probes the old transport.
    return await action()
  } finally {
    resumeLiftedStatus(lifted)
  }
}

function resumeLiftedStatus(environmentIds: readonly string[]): void {
  try {
    resumeRuntimeEnvironmentStatus(environmentIds)
  } catch (error) {
    // A server removed during the action has no status to resume; keep the action's own result.
    console.warn('[managed-dolphind] Could not resume status after an explicit action:', error)
  }
}
