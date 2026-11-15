/** C7 supplies visible demand; these production probes serve the WSL liveness supervisor. */
import {
  probeThenWatchWslDolphindBridges,
  type WslDolphindBridgeActivity
} from './wsl-dolphind-bridge-activity'
import { pairedRuntimeConnectionFromOffer } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import {
  type DolphindTerminalCensus,
  UNVERIFIABLE_DOLPHIND_TERMINAL_CENSUS
} from '../../../shared/dolphind-terminal-census'
import { requestDolphindTerminalCensus } from '../../managed-server/lifecycle/dolphind-terminal-census-client'
import { subscribeSystemPowerLifecycle } from '../../power/system-power-lifecycle'
import {
  deferUntilWslDistroRunning,
  readSettledConfirmedRunningWslDistros
} from '../discovery/wsl-background-distro-gate'
import type { WslDistroHolder } from '../discovery/wsl-distro-holder-types'
import { readWslGuestIdentity } from '../execution/wsl-guest-process-identity'
import type { WslDolphindConnection } from './wsl-dolphind-connection-types'
import type { WslDolphindConnectionManager } from './wsl-dolphind-connection'
import { defaultWslDolphindEnvironmentId } from './wsl-dolphind-deploy'
import { EXIT_SETTLE_MS } from './wsl-dolphind-liveness-evidence'
import { requireConfirmedRunning } from './wsl-dolphind-connection-errors'
import { WslDolphindLivenessSupervisor } from './wsl-dolphind-liveness-supervisor'
import { createWslDolphindHostTransport } from './wsl-dolphind-host-transport'
import { openWslDolphindWatch } from './wsl-dolphind-watch'

function transportFor(distro: string, environmentId = defaultWslDolphindEnvironmentId(distro)) {
  return createWslDolphindHostTransport({
    target: { kind: 'wsl', id: environmentId, distro, label: distro }
  })
}

/** Every session counts (activation time 0): liveness asks how many survived, not how new. */
function collectWslDolphindCensus(connection: WslDolphindConnection): Promise<DolphindTerminalCensus> {
  const offer = parsePairingCode(connection.pairingOffer)
  return offer
    ? requestDolphindTerminalCensus(pairedRuntimeConnectionFromOffer(offer), 0)
    : Promise.resolve(UNVERIFIABLE_DOLPHIND_TERMINAL_CENSUS)
}

export function createWslDolphindLivenessSupervisor(options: {
  manager: WslDolphindConnectionManager
  bridgeActivity: WslDolphindBridgeActivity
  holder: WslDistroHolder
  hasUserVisibleWork: (distro: string) => boolean
}): WslDolphindLivenessSupervisor {
  return new WslDolphindLivenessSupervisor({
    manager: options.manager,
    readRunning: ({ distro, exitedAt, probedAfter }) => {
      const settled =
        exitedAt === null || exitedAt === undefined ? undefined : exitedAt + EXIT_SETTLE_MS
      return readSettledConfirmedRunningWslDistros(
        distro,
        probedAfter === undefined ? settled : Math.max(settled ?? -Infinity, probedAfter)
      )
    },
    readIdentity: (distro, dolphindPid) => readWslGuestIdentity(transportFor(distro), dolphindPid),
    openWatch: (connection) =>
      probeThenWatchWslDolphindBridges(
        () =>
          openWslDolphindWatch(
            transportFor(connection.distro, connection.environmentId),
            connection.remotePort
          ),
        options.bridgeActivity,
        connection.environmentId
      ),
    collectCensus: collectWslDolphindCensus,
    hasUserVisibleWork: options.hasUserVisibleWork,
    deferUntilRunning: deferUntilWslDistroRunning,
    requireRunning: async (distro) =>
      requireConfirmedRunning(await readSettledConfirmedRunningWslDistros(distro), distro),
    // Liveness is background work: the holder may re-spawn only into a distro that runs (E9).
    ensureHolder: (distro) =>
      options.holder.ensureHeld(distro, {
        requireRunning: async () =>
          requireConfirmedRunning(await readSettledConfirmedRunningWslDistros(distro), distro)
      }),
    subscribePower: subscribeSystemPowerLifecycle
  })
}
