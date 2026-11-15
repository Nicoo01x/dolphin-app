import type { ServeReadiness } from '../server/serve-readiness'
import type { DolphinRuntimeRpcServer } from '../runtime/rpc/server/runtime-rpc'
import { buildServePairingReadiness } from '../server/serve-pairing-readiness'
import type { DolphindHealth } from './dolphind-health'
import type { DolphindOptions } from './dolphind-start-contract'

export async function buildDolphindServeReadiness(input: {
  options: DolphindOptions
  runtimeId: string
  rpc: Pick<DolphinRuntimeRpcServer, 'getWebSocketEndpoint' | 'createPairingOffer'>
  collectHealth: () => Promise<DolphindHealth>
}): Promise<ServeReadiness> {
  return {
    runtimeId: input.runtimeId,
    ...(await buildServePairingReadiness(input.options, input.rpc)),
    // WSL CLI reconciliation runs only in desktop launch, so no repair is pending here.
    managedWslCliReconciliation: 'settled',
    // Deployers inspect readiness health to reject hosts whose terminal daemon is unavailable.
    health: await input.collectHealth()
  }
}
