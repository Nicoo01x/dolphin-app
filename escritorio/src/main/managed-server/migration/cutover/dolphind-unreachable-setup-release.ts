/** Release conversion setups stranded before staging by refused SSH forwarding. Stop any activated slot, unregister, then use undeployed-fence release; source rows remain intact for retry. */
import { listEnvironments } from '../../../../shared/remote-runtime/host-store/runtime-environment-store'
import { removeManagedDolphindEnvironment } from '../../../../shared/remote-runtime/host-store/runtime-environment-managed-dolphind-store'
import { findDolphindMigrationSourceCutoverForTarget } from '../../../persistence/migrating-dolphind-catalog/dolphind-migration-cutover-journal'
import { releaseUndeployedMigrationFence } from '../../../ssh/migration-source/dolphind-migration-source-fence'
import { closeDolphindManagedTunnel } from '../../lifecycle/dolphind-managed-tunnel'
import type { SshTargetDolphindClaims } from '../../../ssh/targets/ssh-target-dolphind-claims'
import { withDolphindActivationLock } from '../../activation/dolphind-activation-lock'
import { withDeactivatedVersionCommitted } from '../../activation/dolphind-activation-record'
import {
  readDolphindActivationRecord,
  writeDolphindActivationRecord
} from '../../activation/dolphind-activation-record-store'
import { managedDolphindSlot } from '../../lifecycle/dolphind-managed-runtime-context'
import { resolveDolphindRemoteContext } from '../../install/dolphind-remote-context'
import { dolphindStopFreedTheHost } from '../../install/dolphind-remote-process-control'
import { dolphindSlotDir, stopDolphindSlot } from '../../activation/dolphind-recovery-slot'

import {
  getSshConnectionManager,
  getSshTargetRegistryStore
} from '../../../ssh/targets/ssh-target-registry'
import { errorMessage } from '../../../../shared/error-message'

export async function releaseUnreachableDolphindSetup(args: {
  userDataPath: string
  claims: SshTargetDolphindClaims
  targetId: string
  signal?: AbortSignal
}): Promise<void> {
  const cutover = findDolphindMigrationSourceCutoverForTarget(args.userDataPath, args.targetId)
  // Staged/committed destinations require their own evidence before release.
  if (cutover?.phase !== 'source-fenced') {
    return
  }
  const environmentId = cutover.destinationEnvironmentId
  await closeDolphindManagedTunnel(environmentId).catch(() => undefined)
  await stopStrandedDolphind(args.targetId, args.signal).catch((error: unknown) => {
    console.warn(`[dolphind] Could not stop the unreachable setup's server: ${errorMessage(error)}`)
  })
  const isRegistered = (id: string): boolean =>
    listEnvironments(args.userDataPath).some((entry) => entry.id === id)
  // Unregister first so an interrupted release leaves a recoverable undeployed fence.
  if (isRegistered(environmentId)) {
    removeManagedDolphindEnvironment(args.userDataPath, environmentId)
  }
  await releaseUndeployedMigrationFence({
    userDataPath: args.userDataPath,
    claims: args.claims,
    targetId: args.targetId,
    isDestinationRegistered: isRegistered,
    signal: args.signal
  })
}

/** Clear active only after proven slot exit; daemon terminals may outlive it. */
async function stopStrandedDolphind(targetId: string, signal?: AbortSignal): Promise<void> {
  const target = getSshTargetRegistryStore()?.getTarget(targetId)
  const connectionManager = getSshConnectionManager()
  if (!target || !connectionManager) {
    return
  }
  const context = await resolveDolphindRemoteContext(
    target,
    await connectionManager.connect(target),
    signal
  )
  if (!context.activationRecord.active) {
    return
  }
  // Port is irrelevant because this recovery never launches a slot.
  const slot = managedDolphindSlot(context, 0, signal)
  await withDolphindActivationLock(
    slot,
    async () => {
      const record = await readDolphindActivationRecord(slot)
      if (!record.active) {
        return
      }
      const stopped = await stopDolphindSlot(slot, dolphindSlotDir(slot, record.active), false)
      if (dolphindStopFreedTheHost(stopped)) {
        await writeDolphindActivationRecord(slot, withDeactivatedVersionCommitted(record))
      }
    },
    () => undefined
  )
}
