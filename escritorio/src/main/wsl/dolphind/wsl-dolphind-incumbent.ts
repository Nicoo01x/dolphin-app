/** E1: open a temporary bridge for incumbent census before activation. Unproven state is unverifiable, never zero; WSL has no standing deploy tunnel. */
import { pairedRuntimeConnectionFromOffer } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import type { PairingOffer } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import { DOLPHIND_MANAGED_REMOTE_PORT } from '../../../shared/dolphind-managed-runtime'
import {
  type DolphindTerminalCensus,
  UNVERIFIABLE_DOLPHIND_TERMINAL_CENSUS
} from '../../../shared/dolphind-terminal-census'
import type { ServeReadiness } from '../../server/serve-readiness'
import { probeActiveDolphindReadiness } from '../../managed-server/activation/dolphind-active-readiness'
import { dolphindBoundPort } from '../../managed-server/lifecycle/dolphind-managed-bound-port'
import { managedDolphindInstallDir } from '../../managed-server/lifecycle/dolphind-managed-runtime-context'
import { wakeStoppedManagedDolphind } from '../../managed-server/lifecycle/dolphind-managed-wake'
import type { DolphindRemoteContext } from '../../managed-server/install/dolphind-remote-context'
import type { DolphindSlotOptions } from '../../managed-server/activation/dolphind-recovery-slot'
import { readRemoteDolphindBuildHash } from '../../managed-server/install/dolphind-remote-build-hash'
import {
  requestDolphindTerminalCensus,
  type DolphindTerminalCensusRequestOptions
} from '../../managed-server/lifecycle/dolphind-terminal-census-client'
import { updateTerminalCounts } from '../../managed-server/activation/dolphind-fenced-stop'
import { tunneledDolphindPairingCode } from '../../managed-server/lifecycle/dolphind-tunneled-pairing'
import type { StartedPortForward } from '../../ssh/port-forwarding/ssh-port-forward-provider'
import type { DolphindHostTransport } from '../../managed-server/install/dolphind-host-transport'
import type { WslDolphindHostTarget } from './wsl-dolphind-host-target'
import { listenWslDolphindStdioBridge } from './wsl-dolphind-stdio-bridge'

export type WslDolphindIncumbent = {
  census: DolphindTerminalCensus
  /** The incumbent's proven readiness; null when it could not be started or proven. */
  readiness: ServeReadiness | null
  /** Recount without wake and close terminal admission before activation stops the incumbent; unreadable never means zero. */
  recount: () => Promise<DolphindTerminalCensus>
  /** Reopens the admission `recount` closed, when the incumbent keeps running. */
  releaseAdmission: () => Promise<void>
}

type IncumbentArgs = {
  context: DolphindRemoteContext<WslDolphindHostTarget>
  slot: DolphindSlotOptions
  /** This desktop's enrolled pairing; null before its first pairing. */
  paired?: PairingOffer | null
}

const UNREADABLE: WslDolphindIncumbent = {
  census: UNVERIFIABLE_DOLPHIND_TERMINAL_CENSUS,
  readiness: null,
  recount: async () => UNVERIFIABLE_DOLPHIND_TERMINAL_CENSUS,
  releaseAdmission: async () => {}
}

export type WslDolphindIncumbentDependencies = {
  wake: typeof wakeStoppedManagedDolphind
  probe: typeof probeActiveDolphindReadiness
  readBuildHash: typeof readRemoteDolphindBuildHash
  listen: (
    transport: DolphindHostTransport,
    remotePort: number,
    target: WslDolphindHostTarget
  ) => Promise<StartedPortForward>
  census: typeof requestDolphindTerminalCensus
}

const DEFAULT_DEPENDENCIES: WslDolphindIncumbentDependencies = {
  wake: wakeStoppedManagedDolphind,
  probe: probeActiveDolphindReadiness,
  readBuildHash: readRemoteDolphindBuildHash,
  listen: (transport, remotePort, target) =>
    listenWslDolphindStdioBridge(transport, {
      environmentId: target.id,
      distro: target.distro,
      remotePort,
      localPort: 0,
      label: `Dolphin server in WSL: ${target.label} (update check)`
    }),
  census: requestDolphindTerminalCensus
}

/** Wake reboot/idle-stopped incumbent, census its daemon, then close the temporary bridge before returning. */
export async function readWslDolphindIncumbent(
  args: IncumbentArgs,
  dependencies: WslDolphindIncumbentDependencies = DEFAULT_DEPENDENCIES
): Promise<WslDolphindIncumbent> {
  const record = args.context.activationRecord
  const activatedAt = record.activatedAt ? Date.parse(record.activatedAt) : Number.NaN
  if (!record.active || !Number.isFinite(activatedAt) || activatedAt < 0) {
    return UNREADABLE
  }
  let readiness: ServeReadiness
  try {
    const wake = await dependencies.wake(args.slot)
    if (wake.outcome === 'started') {
      readiness = wake.readiness
    } else if (wake.outcome === 'serving') {
      const remoteInstallDir = managedDolphindInstallDir(args.context, record.active)
      readiness = await dependencies.probe(
        { ...args.slot, remoteInstallDir },
        {
          buildHash: await dependencies.readBuildHash(args.slot, remoteInstallDir),
          fullVersion: record.active
        }
      )
    } else {
      return UNREADABLE
    }
  } catch {
    return UNREADABLE
  }
  const counts = updateTerminalCounts((options) =>
    countIncumbentTerminals(args, readiness, activatedAt, dependencies, options)
  )
  return {
    census: await counts.countFirst(),
    readiness,
    recount: counts.recountCensus,
    releaseAdmission: counts.releaseIncumbentAdmission
  }
}

async function countIncumbentTerminals(
  args: IncumbentArgs,
  readiness: ServeReadiness,
  activatedAt: number,
  dependencies: WslDolphindIncumbentDependencies,
  options: DolphindTerminalCensusRequestOptions
): Promise<DolphindTerminalCensus> {
  let forward: StartedPortForward | null = null
  try {
    forward = await dependencies.listen(
      args.slot.conn,
      dolphindBoundPort(readiness) ?? DOLPHIND_MANAGED_REMOTE_PORT,
      args.context.target
    )
    // Use enrolled grants; startup offers would enroll a fresh device on every census.
    const offer = parsePairingCode(
      tunneledDolphindPairingCode(readiness, forward.entry.localPort, args.paired)
    )
    if (!offer) {
      return UNVERIFIABLE_DOLPHIND_TERMINAL_CENSUS
    }
    return await dependencies.census(
      pairedRuntimeConnectionFromOffer(offer),
      activatedAt,
      undefined,
      options
    )
  } catch {
    return UNVERIFIABLE_DOLPHIND_TERMINAL_CENSUS
  } finally {
    await forward?.close().catch(() => {})
  }
}
