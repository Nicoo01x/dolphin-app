import {
  isRetainedDolphindMigrationSourceCutover,
  type DolphindMigrationSourceCutover
} from '../../../shared/dolphind-migration/dolphind-migration-source-cutover'
import {
  getDolphindSshDeployment,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { listDolphindMigrationSourceCutovers } from '../../persistence/migrating-dolphind-catalog/dolphind-migration-cutover-journal'

type DolphindManagedPendingMigration = {
  migrationId: string
  environmentId: string
  name: string
  sshTargetId: string
  phase: DolphindMigrationSourceCutover['phase']
  startedAt: string
}

/** Unreadable journals must not look like absent migrations. */
export function listPendingManagedDolphindMigrations(
  userDataPath: string
): DolphindManagedPendingMigration[] {
  return (
    listDolphindMigrationSourceCutovers(userDataPath)
      // Committed/retained journals preserve downgrade recovery, not pending migration work.
      .filter(
        (cutover) =>
          cutover.phase !== 'source-retired' && !isRetainedDolphindMigrationSourceCutover(cutover)
      )
      .map((cutover) => ({
        migrationId: cutover.migrationId,
        environmentId: cutover.destinationEnvironmentId,
        name: cutover.destinationName,
        sshTargetId: cutover.sshTargetId,
        phase: cutover.phase,
        startedAt: cutover.startedAt
      }))
  )
}

export function findIncompleteManagedDolphindMigration(
  userDataPath: string,
  environmentId: string
): DolphindManagedPendingMigration | null {
  return (
    listPendingManagedDolphindMigrations(userDataPath).find(
      (migration) => migration.environmentId === environmentId
    ) ?? null
  )
}

export function environmentMatchesManagedDolphindCutover(
  environment: KnownRuntimeEnvironment,
  cutover: DolphindMigrationSourceCutover
): boolean {
  const deployment = getDolphindSshDeployment(environment)
  return (
    environment.id === cutover.destinationEnvironmentId &&
    environment.name === cutover.destinationName &&
    deployment?.sshTargetId === cutover.sshTargetId &&
    deployment.sshTargetGeneration === cutover.sshTargetGeneration
  )
}
