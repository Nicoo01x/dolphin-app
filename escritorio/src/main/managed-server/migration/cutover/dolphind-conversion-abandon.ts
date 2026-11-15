/** Registered destinations must abort/prove empty, then unregister before fence release so later starts cannot reclaim the host. Never-registered destinations held nothing. */
import { removeManagedDolphindEnvironment } from '../../../../shared/remote-runtime/host-store/runtime-environment-managed-dolphind-store'
import { listEnvironments } from '../../../../shared/remote-runtime/host-store/runtime-environment-store'
import type { KnownRuntimeEnvironment } from '../../../../shared/remote-runtime/host-catalog/runtime-environments'
import { closeDolphindManagedTunnel } from '../../lifecycle/dolphind-managed-tunnel'
import {
  abortDolphindMigrationCutover,
  type DolphindMigrationAbortResult,
  type DolphindMigrationCutoverContext,
  type DolphindMigrationDestinationCatalog
} from './dolphind-migration-cutover-coordinator'
import { findDolphindMigrationSourceCutoverForTarget } from '../../../persistence/migrating-dolphind-catalog/dolphind-migration-cutover-journal'
import {
  releaseDolphindMigrationFence,
  releaseUndeployedMigrationFence
} from '../../../ssh/migration-source/dolphind-migration-source-fence'

export async function abandonDolphindConversion(args: {
  userDataPath: string
  store: DolphindMigrationCutoverContext['store']
  claims: DolphindMigrationCutoverContext['claims']
  targetId: string
  destinationFor: (environment: KnownRuntimeEnvironment) => DolphindMigrationDestinationCatalog
}): Promise<DolphindMigrationAbortResult | 'none'> {
  const cutover = findDolphindMigrationSourceCutoverForTarget(args.userDataPath, args.targetId)
  // Committed delta chains resolve only through the delta flow.
  if (!cutover || cutover.supersedesMigrationId) {
    return 'none'
  }
  const isRegistered = (id: string): boolean =>
    listEnvironments(args.userDataPath).some((entry) => entry.id === id)
  const environment = listEnvironments(args.userDataPath).find(
    (entry) => entry.id === cutover.destinationEnvironmentId
  )
  if (!environment) {
    await releaseUndeployedMigrationFence({ ...args, isDestinationRegistered: isRegistered })
    return 'none'
  }
  const context = { ...args, destination: args.destinationFor(environment) }
  return abortDolphindMigrationCutover(context, cutover.migrationId, async (aborted) => {
    await closeDolphindManagedTunnel(environment.id).catch(() => undefined)
    removeManagedDolphindEnvironment(args.userDataPath, environment.id)
    await releaseDolphindMigrationFence(context, aborted)
  })
}
