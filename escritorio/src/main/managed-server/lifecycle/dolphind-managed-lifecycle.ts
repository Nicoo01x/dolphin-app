import { assertRuntimeEnvironmentNotReconciling } from '../../../shared/remote-runtime/host-catalog/runtime-environment-reconciliation-record'
import { runTargetLifecycle } from '../../ipc/ssh/ssh-target-lifecycle-queue'
import { rebuildDolphindManagedTunnel } from './dolphind-managed-tunnel'
import { requireManagedDolphindEnvironment } from './dolphind-managed-runtime-context'

export type LifecycleArgs = { selector: string; signal?: AbortSignal }

export function withManagedDolphindLifecycle<T>(
  userDataPath: string,
  selector: string,
  run: (managed: ReturnType<typeof requireManagedDolphindEnvironment>) => Promise<T>
): Promise<T> {
  const { environment, deployment } = requireManagedDolphindEnvironment(userDataPath, selector)
  return runTargetLifecycle(deployment.sshTargetId, async () => {
    // Re-read in the lifecycle queue because reconciliation/stop may have won first.
    const current = requireManagedDolphindEnvironment(userDataPath, environment.id)
    assertRuntimeEnvironmentNotReconciling(current.environment)
    return run(current)
  })
}

/** Rebuild forwarding when a launched slot binds a different port. */
export async function followLaunchedServerPort(
  userDataPath: string,
  environmentId: string
): Promise<void> {
  try {
    await rebuildDolphindManagedTunnel(userDataPath, environmentId)
  } catch (error) {
    // Server already launched; if tunnel rebuild fails, the next connect can forward its bound port.
    console.warn('[ssh] Could not forward to the relaunched managed Dolphin server:', error)
  }
}
