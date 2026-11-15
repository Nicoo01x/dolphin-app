import { redactRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { DolphindManagedRecoveryResult } from '../../../shared/dolphind-managed-runtime'
import { recoverInterruptedDolphindActivation } from '../activation/dolphind-activation-recovery'
import { managedDolphindSlot, resolveLinkedDolphindContext } from './dolphind-managed-runtime-context'

import { refreshMaintainedDolphindPairing } from './dolphind-maintenance-pairing-refresh'
import type { LifecycleArgs } from './dolphind-managed-lifecycle'
import { withManagedDolphindLifecycle, followLaunchedServerPort } from './dolphind-managed-lifecycle'

export function recoverManagedDolphindEnvironment(
  userDataPath: string,
  args: LifecycleArgs & { acceptChangedState?: boolean }
): Promise<DolphindManagedRecoveryResult> {
  return withManagedDolphindLifecycle(
    userDataPath,
    args.selector,
    async ({ environment, deployment }) => {
      const context = await resolveLinkedDolphindContext(environment, deployment, args.signal)
      const result = await recoverInterruptedDolphindActivation({
        ...managedDolphindSlot(context, deployment.remotePort, args.signal),
        acceptChangedState: args.acceptChangedState === true
      })
      if (result.outcome !== 'recovered') {
        return result
      }
      const updated = result.readiness
        ? refreshMaintainedDolphindPairing(userDataPath, environment.id, result.readiness)
        : environment
      if (result.activeVersion) {
        await followLaunchedServerPort(userDataPath, environment.id)
      }
      return {
        outcome: 'recovered',
        resolution: result.resolution,
        activeVersion: result.activeVersion,
        environment: redactRuntimeEnvironment(updated)
      }
    }
  )
}
