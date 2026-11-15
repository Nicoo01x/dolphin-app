// A saved tunnel port can become unbindable: a Windows excluded port range or another app's listener.
import { moveManagedDolphindLocalPort } from '../../../shared/remote-runtime/host-store/runtime-environment-managed-dolphind-store'
import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { getDolphindSshDeployment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { reserveLocalForwardPort } from '../../ssh/system-transport/forwarding/system-ssh-forward-port-reservation'
import { notifyManagedDolphindPairingRepaired } from './dolphind-managed-pairing-repaired-listener'

// Reservation reports the bind error code as `cause`; Windows excluded ranges answer EACCES.
const UNBINDABLE_LOCAL_PORT_CODES = new Set<unknown>(['EADDRINUSE', 'EACCES'])

// Retry an unbindable desktop-local port without changing the server’s pairing, identity or projects.
export async function buildOnBindableLocalPort<T>(
  userDataPath: string,
  environmentId: string,
  build: () => Promise<T>
): Promise<T> {
  const savedPort = () =>
    getDolphindSshDeployment(resolveEnvironment(userDataPath, environmentId))?.localPort
  const saved = savedPort()
  try {
    return await build()
  } catch (error) {
    if (saved === undefined) {
      throw error
    }
    // A concurrent build moved this server, superseding or failing ours; build on what it saved.
    if (savedPort() !== saved) {
      return build()
    }
    if (!(error instanceof Error) || !UNBINDABLE_LOCAL_PORT_CODES.has(error.cause)) {
      throw error
    }
    const localPort = await reserveLocalForwardPort(0)
    if (savedPort() !== saved) {
      return build()
    }
    console.warn(
      `[ssh] Moving the tunnel to this host’s Dolphin server from local port ${saved} to ${localPort}: ${error.message}`
    )
    moveManagedDolphindLocalPort(userDataPath, environmentId, localPort)
    // Like a repair, the rebind retires transports and status owners still dialing the old port.
    await notifyManagedDolphindPairingRepaired(environmentId)
    return build()
  }
}
