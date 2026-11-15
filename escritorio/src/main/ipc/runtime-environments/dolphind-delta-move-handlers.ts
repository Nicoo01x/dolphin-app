/** IPC for a host an older build changed after conversion: move its newer projects, or keep the server's. */
import { ipcMain } from 'electron'
import type {
  DolphindDeltaMovePreview,
  DolphindDeltaMoveResult
} from '../../../shared/dolphind-managed-runtime'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { requireManagedDolphindInfrastructure } from '../../managed-server/lifecycle/dolphind-managed-runtime-context'
import { ensureDolphindManagedTunnel } from '../../managed-server/lifecycle/dolphind-managed-tunnel'
import {
  keepDolphindServerVersion,
  runDolphindDeltaMove
} from '../../managed-server/migration/cutover/dolphind-migration-delta-move'
import { planDolphindDeltaMove } from '../../managed-server/migration/cutover/dolphind-migration-delta-plan'
import { censusHostRelayTerminalsFor } from '../../ssh/legacy-relay/endpoints/ssh-host-relay-census-for-target'
import {
  dolphindMigrationDestinationFor,
  dolphindServerAutomationEnablerFor
} from '../../managed-server/lifecycle/dolphind-runtime-conversion-wiring'
import { enableMovedDolphindAutomationsForTarget } from '../../persistence/migrating-dolphind-catalog/dolphind-migration-moved-automations'
import { requiredString } from './dolphind-runtime-lifecycle-handlers'
import { publishResolvedChangedHostStatus } from './runtime-environment-managed-tunnel'
import { runTargetLifecycle } from '../ssh/ssh-target-lifecycle-queue'

export function registerDolphindDeltaMoveHandlers(getUserDataPath: () => string): void {
  ipcMain.handle(
    'runtimeEnvironments:previewDolphindDeltaMove',
    (_event, args: { sshTargetId: string }): DolphindDeltaMovePreview => {
      const { store, target } = requireChangedHost(args)
      const plan = planDolphindDeltaMove(getUserDataPath(), store, target)
      const { sshTargetId, environmentId, added, notReflected, blockers } = plan
      return { sshTargetId, environmentId, added, notReflected, blockers }
    }
  )
  ipcMain.handle(
    'runtimeEnvironments:moveDolphindDelta',
    async (_event, args: { sshTargetId: string }): Promise<DolphindDeltaMoveResult> => {
      const userDataPath = getUserDataPath()
      const { store, claims, target } = requireChangedHost(args)
      const environment = listEnvironments(userDataPath).find(
        (entry) => entry.id === target.dolphindFence?.environmentId
      )
      if (!environment) {
        throw new Error('This host’s Dolphin server is no longer registered.')
      }
      const result = await runDolphindDeltaMove({
        userDataPath,
        store,
        claims,
        target,
        environment,
        connectDestination: async () =>
          dolphindMigrationDestinationFor(
            await ensureDolphindManagedTunnel(userDataPath, environment.id)
          ),
        censusHost: censusHostRelayTerminalsFor(target),
        runTargetLifecycle
      })
      if (result.outcome === 'moved') {
        // Tunnel repair may have re-paired the server; read its current credentials.
        const paired = listEnvironments(userDataPath).find((entry) => entry.id === environment.id)
        const automationsLeftDisabled = await enableMovedDolphindAutomationsForTarget(
          userDataPath,
          target.id,
          dolphindServerAutomationEnablerFor(paired ?? environment)
        ).catch((error: unknown) => {
          console.warn('[ssh] Could not re-enable moved automations:', error)
          return 0
        })
        publishResolvedChangedHostStatus(target, environment.id, automationsLeftDisabled)
      }
      return result
    }
  )
  ipcMain.handle(
    'runtimeEnvironments:keepDolphindServerVersion',
    async (_event, args: { sshTargetId: string }): Promise<void> => {
      const { store, claims, target, environmentId } = requireChangedHost(args)
      await runTargetLifecycle(target.id, () =>
        keepDolphindServerVersion({ userDataPath: getUserDataPath(), store, claims, target })
      )
      publishResolvedChangedHostStatus(target, environmentId)
    }
  )
}

function requireChangedHost(args: { sshTargetId: string } | undefined) {
  const sshTargetId = requiredString(args?.sshTargetId, 'SSH target')
  const { targetStore, claims } = requireManagedDolphindInfrastructure()
  const store = targetStore.getDolphindMigrationSource()
  const target = store.getSshTarget(sshTargetId)
  if (!target?.dolphindFence?.sourceChangedAt) {
    throw new Error('This SSH host has no changes from an older Dolphin to resolve.')
  }
  return { store, claims, target, environmentId: target.dolphindFence.environmentId }
}
