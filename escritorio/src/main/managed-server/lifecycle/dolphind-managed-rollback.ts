import { redactRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { KnownRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { DolphindManagedRollbackResult } from '../../../shared/dolphind-managed-runtime'
import { probeActiveDolphindReadiness } from '../activation/dolphind-active-readiness'
import { CURRENT_DOLPHIND_DAEMON_PROTOCOL } from '../activation/dolphind-daemon-protocol-crossing'
import {
  managedDolphindInstallDir,
  managedDolphindSlot,
  resolveLinkedDolphindContext
} from './dolphind-managed-runtime-context'

import { readRemoteDolphindBuildHash } from '../install/dolphind-remote-build-hash'
import { rollbackDolphind } from '../install/dolphind-remote-rollback'
import { collectManagedTerminalCensus } from './dolphind-terminal-census-client'
import { updateTerminalCounts } from '../activation/dolphind-fenced-stop'
import { findIncompleteManagedDolphindMigration } from './dolphind-managed-migration-status'
import { latestDolphindMigrationInto } from '../../persistence/migrating-dolphind-catalog/dolphind-migration-rollback-mark'
import { refreshMaintainedDolphindPairing } from './dolphind-maintenance-pairing-refresh'
import type { LifecycleArgs } from './dolphind-managed-lifecycle'
import { withManagedDolphindLifecycle, followLaunchedServerPort } from './dolphind-managed-lifecycle'

export function rollbackManagedDolphindEnvironment(
  userDataPath: string,
  args: LifecycleArgs
): Promise<DolphindManagedRollbackResult> {
  return withManagedDolphindLifecycle(
    userDataPath,
    args.selector,
    async ({ environment, deployment }) => {
      const context = await resolveLinkedDolphindContext(environment, deployment, args.signal)
      const record = context.activationRecord
      const target = record.previous
      if (!target) {
        return {
          outcome: 'refused',
          code: 'dolphind_rollback_no_target',
          reason: 'This server has no previous version to roll back to.'
        }
      }
      const crossing = migrationRollbackRefusal(userDataPath, environment, record.activatedAt)
      if (crossing) {
        return crossing
      }
      const slot = managedDolphindSlot(context, deployment.remotePort, args.signal)
      const targetDir = managedDolphindInstallDir(context, target)
      const targetBuildHash = await readRemoteDolphindBuildHash(slot, targetDir)
      const { countFirst, ...recount } = updateTerminalCounts((options) =>
        collectManagedTerminalCensus(userDataPath, environment, record, undefined, options)
      )
      // Recount under lock before rollback stop; this initial census closes no admission.
      const census = await countFirst()
      // Require idle because this client cannot prove the older build's daemon protocol attaches to live terminals.
      if (census.liveSessions !== 0) {
        return {
          outcome: 'refused',
          code:
            census.liveSessions === null
              ? 'dolphind_rollback_census_unavailable'
              : 'dolphind_rollback_terminals_running',
          reason:
            census.liveSessions === null
              ? 'The server did not answer how many terminals it runs. Retry when it answers.'
              : 'Close the terminals running on this server before rolling it back.'
        }
      }
      const result = await rollbackDolphind({
        ...slot,
        record,
        census,
        ...recount,
        targetBuildHash,
        targetDaemonProtocol: CURRENT_DOLPHIND_DAEMON_PROTOCOL
      })
      if (result.outcome !== 'rolled-back') {
        return result
      }
      const readiness = await probeActiveDolphindReadiness(
        { ...slot, remoteInstallDir: targetDir },
        { buildHash: targetBuildHash, fullVersion: result.target }
      )
      const updated = refreshMaintainedDolphindPairing(userDataPath, environment.id, readiness)
      await followLaunchedServerPort(userDataPath, environment.id)
      return {
        outcome: 'rolled-back',
        environment: redactRuntimeEnvironment(updated),
        activeVersion: result.target,
        discarded: result.discarded
      }
    }
  )
}

/** A post-activation migration is absent from the rollback snapshot; restoring it would discard imported state. */
function migrationRollbackRefusal(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  activatedAt: string | null
): DolphindManagedRollbackResult | null {
  if (findIncompleteManagedDolphindMigration(userDataPath, environment.id)) {
    return {
      outcome: 'refused',
      code: 'dolphind_rollback_migration_in_progress',
      reason: 'A migration into this server is still running. Finish it before rolling back.'
    }
  }
  const migratedAt = latestDolphindMigrationInto(userDataPath, environment)
  if (migratedAt && (activatedAt === null || Date.parse(activatedAt) < Date.parse(migratedAt))) {
    return {
      outcome: 'refused',
      code: 'dolphind_rollback_crosses_migration',
      reason:
        "The previous version's state predates the projects migrated onto this server; " +
        'rolling back would lose them. Deploy forward instead.'
    }
  }
  return null
}
