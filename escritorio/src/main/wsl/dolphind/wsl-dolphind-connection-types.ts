import type { WslHostDeferredUpdate } from '../../../shared/wsl-host-types'
import type { PairingOffer } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import type { DolphindTunnelIdentity } from '../../managed-server/lifecycle/dolphind-managed-tunnel-identity'
import type { ServeReadiness } from '../../server/serve-readiness'
import type { DolphindHostTransport } from '../../managed-server/install/dolphind-host-transport'
import type { StartedPortForward } from '../../ssh/port-forwarding/ssh-port-forward-provider'
import type { WslDistroHolder } from '../discovery/wsl-distro-holder-types'
import type { WslDolphindConnectionStatus } from './wsl-dolphind-connection-status'
import type { WslDolphindDeployOptions, WslDolphindLaunch } from './wsl-dolphind-launch-contract'
import type { WslDolphindHostTarget } from './wsl-dolphind-host-target'
import type { WslDolphindPairingRecovery } from './wsl-dolphind-pairing-identity'
import type { WslDolphindStdioBridgeOptions } from './wsl-dolphind-stdio-bridge'

/** One open bridge to a distro's dolphind, as the connection manager publishes it. */
export type WslDolphindConnection = {
  distro: string
  environmentId: string
  /** The loopback port on this machine the pairing offer points at. */
  localPort: number
  /** dolphind's port inside the distro. */
  remotePort: number
  fullVersion: string
  /** dolphind's pid inside the distro, from its pid file; null when unreadable. */
  pid: number | null
  /** dolphind's pairing code, with its endpoint rewritten to `ws://127.0.0.1:<localPort>`. */
  pairingOffer: string
  /** An app update the incumbent `fullVersion` is waiting to take (live terminals). */
  deferredUpdate: WslHostDeferredUpdate | null
  close(): Promise<void>
}

export type WslDolphindConnectionDependencies = {
  holder?: WslDistroHolder
  getPairingOffer?: (environmentId: string) => PairingOffer | null
  /** The bridge port the host's record saved: rebinding it keeps the pairing across app restarts. */
  recordedLocalPort?: (environmentId: string) => number | null
  deployAndLaunch?: (distro: string, options: WslDolphindDeployOptions) => Promise<WslDolphindLaunch>
  createTransport?: (target: WslDolphindHostTarget) => DolphindHostTransport
  listen?: (
    transport: DolphindHostTransport,
    options: WslDolphindStdioBridgeOptions
  ) => Promise<StartedPortForward>
  verifyIdentity?: (pairingOffer: string, readiness: ServeReadiness) => Promise<DolphindTunnelIdentity>
  /** Re-pairs a refused enrolled token; without it a refusal fails the connect. */
  pairingRecovery?: Omit<WslDolphindPairingRecovery, 'environmentId'>
  /** A connection (re)opened, its offer changed, or its status moved; null once it closed. */
  onChange?: (
    distro: string,
    connection: WslDolphindConnection | null,
    status: WslDolphindConnectionStatus
  ) => void
}
