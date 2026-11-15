/** Use the managed SSH repair gate for refused WSL enrollment: serialize, cap attempts and require the pinned host key. Read new offers inside the local distro. */
import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import {
  findWslHostDeployment,
  refreshWslHostPairing
} from '../../../shared/remote-runtime/host-store/runtime-environment-wsl-host-store'
import type { KnownRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { readActiveManagedDolphindReadiness } from '../../managed-server/lifecycle/dolphind-managed-bound-port'
import {
  ManagedDolphindPairingRepairs,
  type ManagedDolphindPairingRepairDeps
} from '../../managed-server/lifecycle/dolphind-managed-pairing-repair'

import { DolphindManagedPairingRepairFailedError } from '../../managed-server/lifecycle/dolphind-managed-pairing-repair-failure'
import { notifyManagedDolphindPairingRepaired } from '../../managed-server/lifecycle/dolphind-managed-pairing-repaired-listener'
import type { WslDolphindHostTarget } from './wsl-dolphind-host-target'
import { type WslDolphindHostTransport, createWslDolphindHostTransport } from './wsl-dolphind-host-transport'
import type { WslDolphindPairingRecovery } from './wsl-dolphind-pairing-identity'

type WslDolphindHostAccess = { target: WslDolphindHostTarget; connection: WslDolphindHostTransport }

export function liveWslDolphindPairingRepairDeps(
  userDataPath: string
): ManagedDolphindPairingRepairDeps<WslDolphindHostAccess> {
  const record = (environmentId: string) => {
    const found = findWslHostDeployment(userDataPath, environmentId)
    if (!found) {
      throw new DolphindManagedPairingRepairFailedError('this server is not a WSL host')
    }
    return found
  }
  return {
    resolve: (environmentId) => resolveEnvironment(userDataPath, environmentId),
    connect: async (environment: KnownRuntimeEnvironment) => {
      const target: WslDolphindHostTarget = {
        kind: 'wsl',
        id: environment.id,
        distro: record(environment.id).distro,
        label: environment.name
      }
      return { target, connection: createWslDolphindHostTransport({ target }) }
    },
    readReadiness: async (access) => {
      try {
        return await readActiveManagedDolphindReadiness(access)
      } finally {
        access.connection.dispose()
      }
    },
    ports: (environment) => {
      const found = findWslHostDeployment(userDataPath, environment.id)
      return found ? { localPort: found.localPort, remotePort: found.remotePort } : null
    },
    refresh: (environmentId, pairingCode) => {
      const { localPort, remotePort } = record(environmentId)
      return refreshWslHostPairing(userDataPath, environmentId, {
        pairingCode,
        localPort,
        remotePort
      }).environment
    },
    repaired: notifyManagedDolphindPairingRepaired,
    now: Date.now
  }
}

/** One gate per desktop, so the cap and a standing failure hold across every WSL connect. */
export function createWslDolphindPairingRecovery(
  userDataPath: string,
  deps: ManagedDolphindPairingRepairDeps<WslDolphindHostAccess> = liveWslDolphindPairingRepairDeps(
    userDataPath
  )
): Omit<WslDolphindPairingRecovery, 'environmentId'> {
  return { repairs: new ManagedDolphindPairingRepairs(deps), resolve: deps.resolve }
}
