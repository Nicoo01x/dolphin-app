import { getAppEnvironment } from '../../../shared/app-environment'
import {
  getManagedDolphindFenceEnvironmentId,
  managedDolphindServerName
} from '../../../shared/managed-dolphind-ssh-owner'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { findDolphindMigrationSourceCutoverForTarget } from '../../persistence/migrating-dolphind-catalog/dolphind-migration-cutover-journal'
import { abandonDolphindConversion } from '../../managed-server/migration/cutover/dolphind-conversion-abandon'
import { retainDolphindMigrationSource } from '../../persistence/migrating-dolphind-catalog/dolphind-migration-source-retention'
import { enableMovedDolphindAutomationsForTarget } from '../../persistence/migrating-dolphind-catalog/dolphind-migration-moved-automations'
import { hasDolphindTemplate } from '../../dolphind/dolphind-artifact-materializer'
import { isDolphindHostUnavailableFixableOnHost } from '../../dolphind/dolphind-host-unavailable'
import { managedServerUpdateDeps } from '../../ssh/host-server/managed-server-update-deps'
import { ensureDolphindManagedTunnel } from '../../managed-server/lifecycle/dolphind-managed-tunnel'
import { verifyDolphindManagedServing } from '../../managed-server/lifecycle/dolphind-managed-serving-verify'
import { convertSshTargetToManagedDolphind } from '../../managed-server/lifecycle/dolphind-runtime-conversion'
import {
  dolphindMigrationDestinationFor,
  dolphindServerAutomationEnablerFor,
  dolphindServerFolderCatalogFor,
  dolphindServerRepositoriesFor
} from '../../managed-server/lifecycle/dolphind-runtime-conversion-wiring'
import { createManagedDolphindEnvironment } from '../../managed-server/lifecycle/dolphind-runtime-deployment'
import type { HostServerOnConnectDeps } from '../../ssh/host-server/ssh-host-server-on-connect'
import {
  censusSshHostRelaysBeforeSession,
  relayTerminalsOnConnect
} from '../../ssh/legacy-relay/endpoints/ssh-host-relay-terminals-on-connect'
import { requireManagedDolphindInfrastructure } from '../../managed-server/lifecycle/dolphind-managed-runtime-context'
import { censusHostRelayTerminalsFor } from '../../ssh/legacy-relay/endpoints/ssh-host-relay-census-for-target'
import { setSshHostServerStatus } from '../../ssh/host-server/ssh-host-server-status'
import { trackSshHostServerEvent } from '../../ssh/host-server/ssh-host-server-telemetry'
import { knownSshHostPlatform } from '../../ssh/remote-host/ssh-host-platform-memo'
import { knownDolphindTunnelTransport } from '../../managed-server/lifecycle/dolphind-tunnel-transport-memo'
import { getSshTargetRegistryStore } from '../../ssh/targets/ssh-target-registry'
import { releaseUnreachableDolphindSetup } from '../../managed-server/migration/cutover/dolphind-unreachable-setup-release'
import { getCurrentMainWindow } from './ssh-ipc-context'
import { broadcastSshState } from './ssh-renderer-broadcast'
import { connectInFlight } from './ssh-connect-attempt-registry'
import { startLegacyRelayBridge } from '../../ssh/legacy-relay/bridge/legacy-relay-bridge-registry'
import { isBridgeableLease } from '../../ssh/legacy-relay/bridge/legacy-relay-bridge-leases'

export function hostServerOnConnectDeps(userDataPath: string): HostServerOnConnectDeps {
  const registry = getSshTargetRegistryStore()!
  const claims = registry.getDolphindRuntimeClaims()
  const store = registry.getDolphindMigrationSource()
  const appVersion = getAppEnvironment().getVersion()
  const isRegistered = (environmentId: string): boolean =>
    listEnvironments(userDataPath).some((entry) => entry.id === environmentId)
  return {
    // A fence alone may be unfinished setup; only registered servers count.
    managedEnvironmentId: (target) => {
      const environmentId = getManagedDolphindFenceEnvironmentId(target)
      return environmentId && isRegistered(environmentId) ? environmentId : null
    },
    ensureTunnel: async (environmentId) => {
      await ensureDolphindManagedTunnel(userDataPath, environmentId)
    },
    ensureServing: (environmentId) => verifyDolphindManagedServing(userDataPath, environmentId),
    retainCommittedSource: async (target) => {
      const head = findDolphindMigrationSourceCutoverForTarget(userDataPath, target.id)
      if (head?.phase !== 'destination-committed') {
        return 0
      }
      await retainDolphindMigrationSource(userDataPath, head.migrationId, store)
      // Retry what earlier connects could not reach the server to re-enable.
      const environment = listEnvironments(userDataPath).find(
        (entry) => entry.id === head.destinationEnvironmentId
      )
      return environment
        ? enableMovedDolphindAutomationsForTarget(
            userDataPath,
            target.id,
            dolphindServerAutomationEnablerFor(environment)
          )
        : 0
    },
    hasTemplate: hasDolphindTemplate,
    recordedUnavailable: (target) =>
      target.managedServerUnavailable?.appVersion === appVersion
        ? target.managedServerUnavailable.reason
        : null,
    recordUnavailable: (target, reason) => {
      if (!isDolphindHostUnavailableFixableOnHost(reason)) {
        registry.updateTarget(target.id, { managedServerUnavailable: { reason, appVersion } })
      }
    },
    ...managedServerUpdateDeps(userDataPath),
    isEmptyHost: (target) => {
      // An interrupted empty-host deploy passes its own claim, recorded by its provisioning intent.
      const environmentId = getManagedDolphindFenceEnvironmentId(target)
      return claims.preflight(
        target.id,
        environmentId
          ? { environmentId, recorded: target.dolphindProvisioning !== undefined }
          : undefined
      ).claimable
    },
    relayTerminals: (target) =>
      relayTerminalsOnConnect({
        store,
        targetId: target.id,
        censusHost: async () =>
          censusSshHostRelaysBeforeSession(
            await requireManagedDolphindInfrastructure().connectionManager.connect(target),
            target.id
          )
      }),
    deploy: (target) =>
      createManagedDolphindEnvironment(userDataPath, {
        name: target.dolphindProvisioning?.name ?? managedDolphindServerName(target),
        sshTargetId: target.id
      }),
    convert: async (target, hostProof) => {
      // COMPAT(legacy-relay-bridge): find the panes old relays still run before the tabs remount.
      if (hostProof?.bridged) {
        await startLegacyRelayBridge(target.id)
      }
      const converted = await convertSshTargetToManagedDolphind(userDataPath, {
        sshTargetId: target.id,
        name: managedDolphindServerName(target),
        // The connect's own census already answered; a conversion before any session reuses it.
        censusHost: (host) =>
          hostProof ? Promise.resolve(hostProof) : censusHostRelayTerminalsFor(host)(),
        isBridgedPaneLease: isBridgeableLease,
        // Releasing the direct session here would cancel the connect that requested conversion.
        destinationFor: dolphindMigrationDestinationFor,
        serverRepositoriesFor: dolphindServerRepositoriesFor,
        serverFolderCatalogFor: dolphindServerFolderCatalogFor,
        serverAutomationEnablerFor: dolphindServerAutomationEnablerFor
      })
      // A quiet retry's refusal is not the user's attempt, so it keeps their consent.
      const quiet = connectInFlight.get(target.id)?.quiet?.active === true
      if (converted.outcome === 'converted' || (converted.outcome === 'refused' && !quiet)) {
        // Move-anyway consent covers one attempt; retain it on failure so held-fence verification can resume.
        registry.updateTarget(target.id, { managedServerLeaveBehind: undefined })
      }
      return converted
    },
    abandonDeploy: async (target) => {
      const environmentId =
        getManagedDolphindFenceEnvironmentId(target) ??
        getManagedDolphindFenceEnvironmentId(registry.getTarget(target.id))
      if (environmentId && !isRegistered(environmentId)) {
        claims.release(target.id, environmentId)
        await claims.flush()
      }
    },
    hasUnfinishedConversion: (target) => {
      const head = findDolphindMigrationSourceCutoverForTarget(userDataPath, target.id)
      return (
        head !== null &&
        !head.supersedesMigrationId &&
        (head.phase === 'source-fenced' || head.phase === 'destination-staged')
      )
    },
    abandonConversion: async (target) => {
      await abandonDolphindConversion({
        userDataPath,
        store,
        claims,
        targetId: target.id,
        destinationFor: dolphindMigrationDestinationFor
      })
    },
    isFencedBeforeStaging: (target) =>
      findDolphindMigrationSourceCutoverForTarget(userDataPath, target.id)?.phase ===
      'source-fenced',
    releaseUnreachableSetup: (target) =>
      releaseUnreachableDolphindSetup({ userDataPath, claims, targetId: target.id }),
    // Read at report time: a deploy or conversion learns the platform while the decision runs.
    report: (target, event) =>
      trackSshHostServerEvent(
        event,
        knownSshHostPlatform(target.id),
        knownDolphindTunnelTransport(target.id)
      ),
    progress: (target, phase) => {
      // Cancelled decisions keep running; their progress must not revive connection status.
      const attempt = connectInFlight.get(target.id)
      if (!attempt || attempt.quiet?.active) {
        return
      }
      setSshHostServerStatus(target.id, { kind: 'setting-up', phase })
      broadcastSshState(getCurrentMainWindow, target.id, {
        targetId: target.id,
        status: 'connecting',
        error: null,
        reconnectAttempt: 0
      })
    }
  }
}
