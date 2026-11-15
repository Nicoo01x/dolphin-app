import { encodePairingOffer } from '../../../shared/remote-runtime/pairing/pairing'
import {
  getPreferredPairingOffer,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { disconnectRegisteredSshTarget } from '../../ipc/ssh/ssh-session-teardown'
import type { DolphindMigrationDestinationCatalog } from '../migration/cutover/dolphind-migration-cutover-coordinator'
import {
  abortRemoteDolphindMigrationCatalog,
  commitRemoteDolphindMigrationCatalog,
  readRemoteDolphindMigrationCatalogState,
  stageRemoteDolphindMigrationCatalog
} from '../migration/catalog/dolphind-migration-catalog-client'
import { listRemoteDolphindRepositories } from '../migration/linking/dolphind-server-repositories'
import {
  stageRemoteDolphindMigrationBlobChunk,
  stageRemoteDolphindMigrationSnapshotChunk
} from '../migration/transfers/dolphind-migration-chunk-client'
import { readRemoteDolphindMigrationCapabilities } from '../migration/catalog/dolphind-migration-capabilities-client'
import { abortRemoteDolphindMigrationCatalogByReference } from '../migration/catalog/dolphind-migration-catalog-reference-client'
import {
  enableRemoteDolphindAutomation,
  type EnableServerAutomation
} from '../../persistence/migrating-dolphind-catalog/dolphind-migration-moved-automations'
import { censusHostRelayTerminalsFor } from '../../ssh/legacy-relay/endpoints/ssh-host-relay-census-for-target'
import { isBridgeableLease } from '../../ssh/legacy-relay/bridge/legacy-relay-bridge-leases'
import type { DolphindManagedConversionArgs } from './dolphind-runtime-conversion'
import type { DolphindServerRepository } from '../migration/linking/dolphind-server-repositories'
import {
  listRemoteDolphindFolderCatalog,
  type DolphindServerFolderCatalog
} from '../migration/linking/dolphind-server-folder-workspaces'

export function dolphindMigrationDestinationFor(
  environment: KnownRuntimeEnvironment
): DolphindMigrationDestinationCatalog {
  const pairingCode = encodePairingOffer(getPreferredPairingOffer(environment))
  const options = environment.runtimeId ? { expectedRuntimeId: environment.runtimeId } : {}
  return {
    readState: (manifest) => readRemoteDolphindMigrationCatalogState(pairingCode, manifest, options),
    stage: (manifest) => stageRemoteDolphindMigrationCatalog(pairingCode, manifest, options),
    commit: (manifest) => commitRemoteDolphindMigrationCatalog(pairingCode, manifest, options),
    abort: (manifest) => abortRemoteDolphindMigrationCatalog(pairingCode, manifest, options),
    abortByReference: (manifest) =>
      abortRemoteDolphindMigrationCatalogByReference(pairingCode, manifest, options),
    stageChunk: (request) => stageRemoteDolphindMigrationSnapshotChunk(pairingCode, request, options),
    readCapabilities: () => readRemoteDolphindMigrationCapabilities(pairingCode, options),
    stageBlobChunk: (request) => stageRemoteDolphindMigrationBlobChunk(pairingCode, request, options)
  }
}

export function dolphindServerRepositoriesFor(
  environment: KnownRuntimeEnvironment
): Promise<DolphindServerRepository[]> {
  const pairingCode = encodePairingOffer(getPreferredPairingOffer(environment))
  return listRemoteDolphindRepositories(
    pairingCode,
    environment.runtimeId ? { expectedRuntimeId: environment.runtimeId } : {}
  )
}

export function dolphindServerFolderCatalogFor(
  environment: KnownRuntimeEnvironment
): Promise<DolphindServerFolderCatalog> {
  const pairingCode = encodePairingOffer(getPreferredPairingOffer(environment))
  return listRemoteDolphindFolderCatalog(
    pairingCode,
    environment.runtimeId ? { expectedRuntimeId: environment.runtimeId } : {}
  )
}

export function dolphindServerAutomationEnablerFor(
  environment: KnownRuntimeEnvironment
): EnableServerAutomation {
  const pairingCode = encodePairingOffer(getPreferredPairingOffer(environment))
  const options = environment.runtimeId ? { expectedRuntimeId: environment.runtimeId } : {}
  return (automation) => enableRemoteDolphindAutomation(pairingCode, automation, options)
}

export function conversionCollaborators(): Pick<
  DolphindManagedConversionArgs,
  | 'destinationFor'
  | 'serverRepositoriesFor'
  | 'serverFolderCatalogFor'
  | 'serverAutomationEnablerFor'
  | 'censusHost'
  | 'isBridgedPaneLease'
  | 'releaseDirectSession'
> {
  return {
    destinationFor: dolphindMigrationDestinationFor,
    serverRepositoriesFor: dolphindServerRepositoriesFor,
    serverFolderCatalogFor: dolphindServerFolderCatalogFor,
    serverAutomationEnablerFor: dolphindServerAutomationEnablerFor,
    censusHost: (target) => censusHostRelayTerminalsFor(target)(),
    isBridgedPaneLease: isBridgeableLease,
    releaseDirectSession: disconnectRegisteredSshTarget
  }
}
