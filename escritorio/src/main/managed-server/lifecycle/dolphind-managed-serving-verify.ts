import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import type { DolphindManagedServing } from './dolphind-managed-serving'
import { verifyManagedTunnelServing } from './dolphind-managed-tunnel'

/** Return unverifiable on failures rather than throwing. */
export function verifyDolphindManagedServing(
  userDataPath: string,
  selector: string
): Promise<DolphindManagedServing> {
  return Promise.resolve()
    .then(() => verifyManagedTunnelServing(resolveEnvironment(userDataPath, selector)))
    .catch((error: unknown) => ({ state: 'unverifiable', detail: String(error) }))
}
