// Keep claims, tunnels and registration until the host proves server exit.
import type {
  DolphindManagedCancelStopResult,
  DolphindManagedForgetResult,
  DolphindManagedStopResult
} from '../../../shared/dolphind-managed-runtime'
import type { DolphindDaemonRetirementVerdict } from '../../../shared/dolphind-stop-request'
import { removeManagedDolphindEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-managed-dolphind-store'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { findManagedSshTwin } from '../../../shared/remote-runtime/host-catalog/runtime-environment-host-key-match'
import type {
  KnownRuntimeEnvironment,
  DolphindSshDeploymentLink
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { recoverInterruptedDolphindActivation } from '../activation/dolphind-activation-recovery'
import { withStaleDolphindActivationRecoveryLock } from '../activation/dolphind-activation-lock'
import { readDolphindActivationTransaction } from '../activation/dolphind-activation-transaction-store'
import { reconcileDolphindDecommission } from './dolphind-decommission-recovery'
import { cancelRemoteDolphindManagedStop } from './dolphind-managed-remote-stop'
import {
  managedDolphindSlot,
  requireManagedDolphindInfrastructure,
  resolveLinkedDolphindContext
} from './dolphind-managed-runtime-context'
import { closeDolphindManagedTunnel, ensureDolphindManagedTunnel } from './dolphind-managed-tunnel'
import { clearManagedDolphindUpdateDeferral } from './dolphind-managed-update-deferrals'
import { removeDolphindMigrationJournalsForDestination } from '../../persistence/migrating-dolphind-catalog/dolphind-migration-cutover-journal'
import { decommissionRemoteDolphind } from '../install/dolphind-remote-decommission'
import { withManagedDolphindLifecycle } from './dolphind-managed-lifecycle'
import { collectManagedTerminalCensus } from './dolphind-terminal-census-client'
import { RemoteInstallLockBusyError } from '../install/remote-install-lock'

type ManagedDolphindStopPolicy = {
  isActiveEnvironment: (environmentId: string) => boolean
  retireLocalState: (environmentId: string) => Promise<void> | void
  /** Runs inside the host's lifecycle, so a Connect queued behind the unlink still wins. */
  releaseHostTransport: (sshTargetId: string) => Promise<void>
}

type Refusal = Extract<DolphindManagedStopResult, { outcome: 'refused' }>
type Stopped = { version: string | null; retirement: DolphindDaemonRetirementVerdict | null }

function refuse(verdict: Refusal['verdict'], code: string, reason: string): Refusal {
  return { outcome: 'refused', verdict, code, reason }
}

export function stopManagedDolphindEnvironment(
  userDataPath: string,
  args: { selector: string; signal?: AbortSignal },
  policy: ManagedDolphindStopPolicy
): Promise<DolphindManagedStopResult> {
  return withManagedDolphindLifecycle(userDataPath, args.selector, async (managed) => {
    const { environment, deployment } = managed
    if (policy.isActiveEnvironment(environment.id)) {
      return refuse(
        'live',
        'dolphind_stop_active_environment',
        'This server is the default host for new projects. Choose another one under New projects open on before stopping it.'
      )
    }
    const stopped = await stopRemote(userDataPath, environment, deployment, args.signal)
    if ('outcome' in stopped) {
      return stopped
    }
    await unlinkEnvironmentLocally(userDataPath, environment, deployment, policy)
    return {
      outcome: 'unlinked',
      verdict: 'exited',
      environmentId: environment.id,
      sshTargetId: deployment.sshTargetId,
      stoppedVersion: stopped.version,
      retirement: stopped.retirement
    }
  })
}

/** Forget local state without assuming host exit; later connects may relink a still-running server. */
export function forgetManagedDolphindEnvironment(
  userDataPath: string,
  args: { selector: string },
  policy: ManagedDolphindStopPolicy
): Promise<DolphindManagedForgetResult> {
  return withManagedDolphindLifecycle(userDataPath, args.selector, (managed) =>
    forgetLinkedEnvironment(userDataPath, managed, policy)
  )
}

/** Forget one of two saved entries for one managed server; the other keeps managing it, so the host is not contacted. */
export function forgetRedundantManagedDolphindEnvironment(
  userDataPath: string,
  args: { selector: string },
  policy: ManagedDolphindStopPolicy
): Promise<DolphindManagedForgetResult> {
  return withManagedDolphindLifecycle(userDataPath, args.selector, (managed) => {
    // Checked in the queue and unlinked in the same tick, so two Removes cannot each count the other as the twin.
    if (!findManagedSshTwin(listEnvironments(userDataPath), managed.environment)) {
      return Promise.resolve(
        refuse(
          'live',
          'dolphind_forget_no_managed_twin',
          'No other saved entry manages this server anymore, so removing this one would leave it unmanaged. Stop it instead.'
        )
      )
    }
    return forgetLinkedEnvironment(userDataPath, managed, policy)
  })
}

async function forgetLinkedEnvironment(
  userDataPath: string,
  {
    environment,
    deployment
  }: { environment: KnownRuntimeEnvironment; deployment: DolphindSshDeploymentLink },
  policy: ManagedDolphindStopPolicy
): Promise<DolphindManagedForgetResult> {
  if (policy.isActiveEnvironment(environment.id)) {
    return refuse(
      'live',
      'dolphind_forget_active_environment',
      'This server is the default host for new projects. Choose another one under New projects open on before forgetting it.'
    )
  }
  await unlinkEnvironmentLocally(userDataPath, environment, deployment, policy)
  return {
    outcome: 'forgotten',
    verdict: 'unverifiable',
    environmentId: environment.id,
    sshTargetId: deployment.sshTargetId
  }
}

async function stopRemote(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  deployment: DolphindSshDeploymentLink,
  signal?: AbortSignal,
  retried = false
): Promise<Stopped | Refusal> {
  const context = await resolveLinkedDolphindContext(environment, deployment, signal)
  const slot = managedDolphindSlot(context, deployment.remotePort, signal)
  const transaction = await readDolphindActivationTransaction(slot)
  if (transaction?.operation === 'decommission') {
    // Resume the exact interrupted stop from its journal.
    const recovered = await recoverInterruptedDolphindActivation(slot)
    if (recovered.outcome === 'recovered' && recovered.activeVersion === null) {
      return { version: transaction.activeVersion, retirement: null }
    }
    if (recovered.outcome === 'refused') {
      return refuse(recovered.verdict, recovered.code, recovered.reason)
    }
    if (recovered.outcome === 'pending') {
      return refuse('unverifiable', recovered.code, recovered.reason)
    }
    // Another run may settle recovery first; restart from its resulting record.
    if (recovered.outcome === 'none') {
      return retried
        ? refuse(
            'unverifiable',
            'dolphind_stop_journal_changed',
            'Another run on this server changed its stop while this one waited. Refresh and retry.'
          )
        : stopRemote(userDataPath, environment, deployment, signal, true)
    }
    return refuse(
      'live',
      'dolphind_stop_withdrawn',
      'The interrupted stop was withdrawn and the server keeps serving. Stop it again.'
    )
  }
  if (transaction) {
    return refuse(
      'unverifiable',
      'dolphind_activation_recovery_required',
      'An earlier update on this server was interrupted. Recover it before stopping.'
    )
  }
  const record = context.activationRecord
  if (!record.active) {
    return { version: null, retirement: null }
  }
  const census = await collectManagedTerminalCensus(userDataPath, environment, record)
  const result = await decommissionRemoteDolphind({ ...slot, record, census })
  if (result.outcome === 'refused') {
    return refuse(result.verdict, result.code, result.reason)
  }
  return { version: result.version, retirement: result.retirement }
}

async function unlinkEnvironmentLocally(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  deployment: DolphindSshDeploymentLink,
  policy: ManagedDolphindStopPolicy
): Promise<void> {
  // Remove registration before releasing claims so crashes leave a resumable hidden target.
  removeManagedDolphindEnvironment(userDataPath, environment.id)
  await policy.retireLocalState(environment.id)
  await closeDolphindManagedTunnel(environment.id)
  const { claims } = requireManagedDolphindInfrastructure()
  claims.releaseForUserRemoval(deployment.sshTargetId, environment.id)
  clearManagedDolphindUpdateDeferral(environment.id)
  await claims.flush()
  // Clear journals after the fence; stale leftovers are recoverable on later conversion.
  removeDolphindMigrationJournalsForDestination(userDataPath, deployment.sshTargetId, environment.id)
  // No server serves the host now, and an unserved host never stays connected.
  await policy.releaseHostTransport(deployment.sshTargetId)
}

export function cancelManagedDolphindStop(
  userDataPath: string,
  args: { selector: string; signal?: AbortSignal }
): Promise<DolphindManagedCancelStopResult> {
  return withManagedDolphindLifecycle(userDataPath, args.selector, async (managed) => {
    const { environment, deployment } = managed
    const context = await resolveLinkedDolphindContext(environment, deployment, args.signal)
    const slot = managedDolphindSlot(context, deployment.remotePort, args.signal)
    let result: DolphindManagedCancelStopResult
    try {
      result = await withStaleDolphindActivationRecoveryLock(slot, async (lock) => {
        const transaction = await readDolphindActivationTransaction(slot)
        if (transaction?.operation !== 'decommission') {
          if (transaction) {
            lock.retain()
          }
          return { outcome: 'none' }
        }
        if (transaction.phase === 'process-exited') {
          lock.retain()
          return { outcome: 'already-stopped' }
        }
        if (transaction.request) {
          const cancellation = await cancelRemoteDolphindManagedStop(slot, transaction.request)
          if (cancellation.outcome !== 'canceled') {
            lock.retain()
            return {
              outcome: 'refused',
              verdict: 'live',
              code: 'dolphind_stop_already_dispatched',
              reason:
                'dolphind already acted on the stop and is shutting down; it cannot be canceled.'
            }
          }
        }
        const kept = await reconcileDolphindDecommission(slot, {
          action: 'keep-serving',
          version: transaction.activeVersion
        })
        if (kept.outcome !== 'recovered' || !kept.activeVersion) {
          lock.retain()
          return {
            outcome: 'refused',
            verdict: 'unverifiable',
            code: 'dolphind_stop_cancel_unverifiable',
            reason: 'The stop was withdrawn but the server could not be shown to be serving.'
          }
        }
        return { outcome: 'canceled', activeVersion: kept.activeVersion }
      })
    } catch (error) {
      if (error instanceof RemoteInstallLockBusyError) {
        return {
          outcome: 'refused',
          verdict: 'unverifiable',
          code: 'dolphind_stop_still_running',
          reason: 'A stop on this server may still be running. Retry after it settles.'
        }
      }
      throw error
    }
    if (result.outcome === 'canceled') {
      await ensureDolphindManagedTunnel(userDataPath, environment.id)
    }
    return result
  })
}
