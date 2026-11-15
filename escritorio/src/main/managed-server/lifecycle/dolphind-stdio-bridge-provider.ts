// Lost channels drop their sockets but keep the listener; tunnel reconnect logic owns recovery.
import { DolphindStdioBridgeUnavailableError } from '../../dolphind/dolphind-host-unavailable'
import type { DolphindHostTransport } from '../install/dolphind-host-transport'
import {
  checkDolphindStdioBridge,
  openDolphindStdioBridgeChannel,
  resolveDolphindStdioBridge,
  type DolphindStdioBridge
} from './dolphind-stdio-bridge'
import { listenDolphindStdioBridge } from './dolphind-stdio-bridge-listener'

import type { RemoteCommandChannel } from '../install/remote-install-transport'
import type { SshConnection } from '../../ssh/connection/ssh-connection'
import type {
  PortForwardStartOptions,
  SshPortForwardProvider,
  StartedPortForward
} from '../../ssh/port-forwarding/ssh-port-forward-provider'

export type DolphindStdioBridgeDependencies = {
  resolveBridge: (conn: DolphindHostTransport, port: number) => Promise<DolphindStdioBridge>
  checkBridge: (conn: DolphindHostTransport, bridge: DolphindStdioBridge) => Promise<unknown>
  openChannel: (
    conn: DolphindHostTransport,
    bridge: DolphindStdioBridge
  ) => Promise<RemoteCommandChannel>
}

export const DOLPHIND_STDIO_BRIDGE_DEPENDENCIES: DolphindStdioBridgeDependencies = {
  resolveBridge: resolveDolphindStdioBridge,
  checkBridge: checkDolphindStdioBridge,
  openChannel: openDolphindStdioBridgeChannel
}

export class DolphindStdioBridgePortForwardProvider implements SshPortForwardProvider {
  constructor(
    private readonly dependencies: DolphindStdioBridgeDependencies = DOLPHIND_STDIO_BRIDGE_DEPENDENCIES
  ) {}

  canHandle(conn: SshConnection): boolean {
    return conn.getClient() !== null || conn.usesSystemSshTransport()
  }

  start(conn: SshConnection, options: PortForwardStartOptions): Promise<StartedPortForward> {
    return startDolphindStdioBridge(conn, options, this.dependencies)
  }
}

export async function startDolphindStdioBridge(
  host: DolphindHostTransport,
  options: PortForwardStartOptions,
  deps: DolphindStdioBridgeDependencies
): Promise<StartedPortForward> {
  let bridge: Promise<DolphindStdioBridge> | null = null
  // Retry failed bridge resolution on the next socket.
  const resolveBridge = (): Promise<DolphindStdioBridge> => {
    bridge ??= deps.resolveBridge(host, options.remotePort).catch((error: unknown) => {
      bridge = null
      throw error
    })
    return bridge
  }
  try {
    await deps.checkBridge(host, await resolveBridge())
  } catch (error) {
    if (error instanceof DolphindStdioBridgeUnavailableError) {
      throw error
    }
    // Lost contact does not prove bridge absence; let new sockets resolve it again.
    console.warn('[ssh] Dolphin stdio bridge check was unverifiable:', error)
  }
  return listenDolphindStdioBridge(options, async () => {
    const resolved = await resolveBridge()
    return { channel: await deps.openChannel(host, resolved), mode: resolved.mode }
  })
}
