import { pairedRuntimeConnectionFromOffer } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import type { PairingOffer } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import type { ServeReadiness } from '../../server/serve-readiness'
import {
  dolphindIdentityRefusal,
  verifyDolphindPairingIdentity,
  type DolphindTunnelIdentity
} from '../../managed-server/lifecycle/dolphind-managed-tunnel-identity'
import { tunneledDolphindPairingCode } from '../../managed-server/lifecycle/dolphind-tunneled-pairing'
import { getPreferredPairingOffer } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  buildWithPairingRepair,
  type ManagedDolphindPairingRecovery
} from '../../managed-server/lifecycle/dolphind-managed-tunnel-pairing-recovery'
import type { WslDolphindLaunch } from './wsl-dolphind-launch-contract'

/** The managed repair gate a refused enrolled token goes through, for one WSL host. */
export type WslDolphindPairingRecovery = Omit<ManagedDolphindPairingRecovery, 'ensure'> & {
  environmentId: string
}

/** Reconnect with enrolled token/pinned host key. Repair refusal once through the gate and verify the replacement; startup offers are for enrollment only. */
export async function resolveWslDolphindPairing(
  launch: Extract<WslDolphindLaunch, { outcome: 'ready' }>,
  localPort: number,
  paired: PairingOffer | null,
  verifyIdentity = verifyWslDolphindIdentity,
  recovery?: WslDolphindPairingRecovery
): Promise<string> {
  const verified = (offer: PairingOffer | null) =>
    verifyWslDolphindPairing(launch, localPort, offer, verifyIdentity)
  // First-time pairing has no enrolled token to repair.
  if (!recovery || !paired) {
    return verified(paired)
  }
  let pairingOffer = ''
  await buildWithPairingRepair(
    {
      ...recovery,
      ensure: async (environment) => {
        pairingOffer = await verified(getPreferredPairingOffer(environment))
      }
    },
    recovery.environmentId,
    async () => {
      pairingOffer = await verified(paired)
    }
  )
  return pairingOffer
}

async function verifyWslDolphindPairing(
  launch: Extract<WslDolphindLaunch, { outcome: 'ready' }>,
  localPort: number,
  paired: PairingOffer | null,
  verifyIdentity: typeof verifyWslDolphindIdentity
): Promise<string> {
  const pairingOffer = tunneledDolphindPairingCode(launch.readiness, localPort, paired)
  const identity = await verifyIdentity(pairingOffer, launch.readiness)
  if (identity.verdict === 'foreign' || identity.verdict === 'unpaired') {
    throw dolphindIdentityRefusal(launch.port, identity)
  }
  if (identity.verdict === 'unreachable') {
    console.warn(
      `[wsl] Dolphin server in ${launch.distro} did not answer its bridge: ${identity.detail}`
    )
  }
  return pairingOffer
}

/** Whether the server behind a WSL bridge is the dolphind that published `readiness`. */
export async function verifyWslDolphindIdentity(
  pairingOffer: string,
  readiness: ServeReadiness
): Promise<DolphindTunnelIdentity> {
  const offer = parsePairingCode(pairingOffer)
  return offer
    ? verifyDolphindPairingIdentity(pairedRuntimeConnectionFromOffer(offer), {
        runtimeId: readiness.runtimeId || null
      })
    : { verdict: 'foreign', detail: 'The Dolphin server in WSL published an invalid pairing offer.' }
}
