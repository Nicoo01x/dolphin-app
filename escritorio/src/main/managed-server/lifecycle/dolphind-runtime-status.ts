import type { DolphindManagedRuntimeStatus } from '../../../shared/dolphind-managed-runtime'
import { runTargetLifecycle } from '../../ipc/ssh/ssh-target-lifecycle-queue'
import type { DolphindActivationTransaction } from '../activation/dolphind-activation-transaction'
import { readDolphindActivationTransaction } from '../activation/dolphind-activation-transaction-store'
import {
  requireManagedDolphindEnvironment,
  resolveLinkedDolphindContext
} from './dolphind-managed-runtime-context'
import { currentManagedDolphindUpdateDeferral } from './dolphind-managed-update-deferrals'
import { findIncompleteManagedDolphindMigration } from './dolphind-managed-migration-status'
import { collectManagedTerminalCensus } from './dolphind-terminal-census-client'
import { getAppEnvironment } from '../../../shared/app-environment'
import { bundledManagedDolphindVersion } from './dolphind-managed-auto-update'
import { availableManagedDolphindUpdate } from './dolphind-managed-update-decision'

/** Read host records without repairing them. */
export async function getManagedDolphindRuntimeStatus(
  userDataPath: string,
  selector: string,
  signal?: AbortSignal
): Promise<DolphindManagedRuntimeStatus> {
  const { environment, deployment } = requireManagedDolphindEnvironment(userDataPath, selector)
  const { status, record, serverTarget } = await runTargetLifecycle(
    deployment.sshTargetId,
    async () => {
      const context = await resolveLinkedDolphindContext(environment, deployment, signal)
      const record = context.activationRecord
      const transaction = await readDolphindActivationTransaction({
        conn: context.connection,
        host: context.host,
        remoteHome: context.remoteHome,
        signal
      })
      const status: DolphindManagedRuntimeStatus = {
        environmentId: environment.id,
        sshTargetId: context.target.id,
        activeVersion: record.active,
        activeAppVersion: record.active ? (record.activeAppVersion ?? null) : null,
        previousVersion: record.previous,
        activatedAt: record.activatedAt,
        rollbackAvailable: Boolean(record.previous && record.snapshot),
        recovery: transaction ? managedRecoveryStatus(transaction) : null,
        terminals: await collectManagedTerminalCensus(userDataPath, environment, record),
        migration: migrationStatus(userDataPath, environment.id),
        deferredUpdate: currentManagedDolphindUpdateDeferral(environment.id, record)
      }
      return { status, record, serverTarget: context.serverTarget }
    }
  )
  // Outside the host queue: hashing the local template must not hold up host actions.
  // A local template fault hides only the offer, never the host's status.
  const candidateVersion = await bundledManagedDolphindVersion(serverTarget).catch(() => null)
  return {
    ...status,
    availableUpdate: availableManagedDolphindUpdate({
      record,
      candidateVersion,
      appVersion: getAppEnvironment().getVersion(),
      deferredCandidateVersion: status.deferredUpdate?.candidateVersion ?? null
    })
  }
}

function managedRecoveryStatus(
  transaction: DolphindActivationTransaction
): NonNullable<DolphindManagedRuntimeStatus['recovery']> {
  switch (transaction.operation) {
    case 'activate':
      return {
        operation: transaction.operation,
        phase: transaction.phase,
        version: transaction.candidateVersion,
        startedAt: transaction.startedAt
      }
    case 'rollback':
      return {
        operation: transaction.operation,
        phase: transaction.phase,
        version: transaction.targetVersion,
        startedAt: transaction.startedAt
      }
    case 'decommission':
      return {
        operation: transaction.operation,
        phase: transaction.phase,
        version: transaction.activeVersion,
        startedAt: transaction.startedAt
      }
  }
}

function migrationStatus(
  userDataPath: string,
  environmentId: string
): DolphindManagedRuntimeStatus['migration'] {
  const migration = findIncompleteManagedDolphindMigration(userDataPath, environmentId)
  return migration
    ? { migrationId: migration.migrationId, phase: migration.phase, startedAt: migration.startedAt }
    : null
}
