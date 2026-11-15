import {
  getPreferredPairingOffer,
  getRuntimeSshAccess,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  readManagedDolphindPublishedKey,
  readManagedDolphindPublishedPort,
  resolveManagedDolphindTunnelPort,
  type DolphindTunnelPortInput
} from './dolphind-managed-bound-port'
import {
  DolphindManagedIdentityError,
  dolphindIdentityRefusal,
  verifyManagedDolphindTunnelIdentity,
  type DolphindTunnelIdentity
} from './dolphind-managed-tunnel-identity'
import { managedDolphindSlot } from './dolphind-managed-runtime-context'
import { DolphindCrashLoopError, wakeManagedDolphindUnlessCrashLooping } from './dolphind-managed-crash-loop'
import { resolveDolphindRemoteContext } from '../install/dolphind-remote-context'
import type { SshConnection } from '../../ssh/connection/ssh-connection'
import type { PortForwardEntry } from '../../../shared/ssh-types'
import type { SshPortForwardManager } from '../../ssh/port-forwarding/ssh-port-forward'

export type DolphindManagedTunnelTargeting = {
  resolveRemotePort: (input: DolphindTunnelPortInput) => Promise<number>
  verifyIdentity: (environment: KnownRuntimeEnvironment) => Promise<DolphindTunnelIdentity>
  /** Wake only proven-stopped slots before rereading ports after foreign answers. */
  wakeStoppedServer?: (input: DolphindTunnelPortInput) => Promise<void>
  readPublishedPort?: (input: DolphindTunnelPortInput) => Promise<number | null>
  /** The server key this host's own slot publishes; null when unreadable. */
  readPublishedKey?: (input: DolphindTunnelPortInput) => Promise<string | null>
}

/** `replaced`: the host's own slot answers SSH with a server key other than the pinned one. */
export type DolphindForwardIdentity =
  | DolphindTunnelIdentity
  | { verdict: 'replaced'; detail: string; environment: { id: string; name: string } }

export const MANAGED_DOLPHIND_TUNNEL_TARGETING: DolphindManagedTunnelTargeting = {
  resolveRemotePort: resolveManagedDolphindTunnelPort,
  verifyIdentity: verifyManagedDolphindTunnelIdentity,
  wakeStoppedServer: wakeStoppedManagedDolphindForTunnel,
  readPublishedPort: readManagedDolphindPublishedPort,
  readPublishedKey: readManagedDolphindPublishedKey
}

// Stopped slots may have lost their port; waking publishes a new free port for the reread.
async function wakeStoppedManagedDolphindForTunnel(input: DolphindTunnelPortInput): Promise<void> {
  const access = getRuntimeSshAccess(input.environment)
  if (!access) {
    return
  }
  let wake: Awaited<ReturnType<typeof wakeManagedDolphindUnlessCrashLooping>>
  try {
    const context = await resolveDolphindRemoteContext(input.target, input.connection)
    wake = await wakeManagedDolphindUnlessCrashLooping(
      input.environment.id,
      input.target.label,
      managedDolphindSlot(context, access.remotePort)
    )
  } catch (error) {
    // Failed wake does not settle identity; reread and validate the resulting forward.
    console.warn('[ssh] Could not start the managed Dolphin server behind a foreign answer:', error)
    return
  }
  // The crash-loop reason beats the foreign-port mismatch the reread would report.
  if (wake.outcome === 'crash-loop') {
    throw new DolphindCrashLoopError(wake.detail)
  }
}

/** Tests may trust persisted ports without an identity round trip. */
export const PERSISTED_PORT_TARGETING: DolphindManagedTunnelTargeting = {
  resolveRemotePort: async ({ environment }) => getRuntimeSshAccess(environment)?.remotePort ?? 0,
  verifyIdentity: async () => ({ verdict: 'verified' })
}

type VerifiedDolphindForwardArgs = {
  targetId: string
  connection: SshConnection
  forwards: SshPortForwardManager
  localPort: number
  label: string
  remotePort: number
  /** Without a reread, foreign answers fail immediately. */
  rereadRemotePort?: () => Promise<number>
  /** Omit when the caller validates identity itself. */
  verify?: (localPort: number) => Promise<DolphindForwardIdentity>
  stillCurrent: () => boolean
}

export type DolphindTunnelStartChecks = Pick<
  VerifiedDolphindForwardArgs,
  'rereadRemotePort' | 'verify'
> & {
  /** Persisted preferred port when the server bound elsewhere. */
  preferredPort?: number
}

export async function environmentForwardChecks(
  targeting: DolphindManagedTunnelTargeting,
  input: DolphindTunnelPortInput
): Promise<
  Required<Pick<VerifiedDolphindForwardArgs, 'remotePort' | 'rereadRemotePort' | 'verify'>>
> {
  return {
    remotePort: await targeting.resolveRemotePort(input),
    rereadRemotePort: async () => {
      await targeting.wakeStoppedServer?.(input)
      return targeting.resolveRemotePort(input)
    },
    verify: async () => {
      const identity = await targeting.verifyIdentity(input.environment)
      if (identity.verdict !== 'foreign' || !targeting.readPublishedKey) {
        return identity
      }
      // A refusal from the slot's own new server is a replaced pairing, not a port another Dolphin took.
      const publishedKey = await targeting.readPublishedKey(input)
      return publishedKey &&
        publishedKey !== getPreferredPairingOffer(input.environment).publicKeyB64
        ? { verdict: 'replaced', detail: identity.detail, environment: input.environment }
        : identity
    }
  }
}

/** Remove superseded forwards; retry foreign ports once. Pinned-server token refusals fail immediately. */
export async function forwardToVerifiedDolphind(
  args: VerifiedDolphindForwardArgs
): Promise<PortForwardEntry | null> {
  let remotePort = args.remotePort
  for (let attempt = 0; ; attempt++) {
    const forward = await addCurrentForward(args, remotePort)
    if (!forward) {
      return null
    }
    const identity = args.verify
      ? await args.verify(forward.localPort)
      : ({ verdict: 'verified' } as const)
    if (!args.stillCurrent()) {
      await args.forwards.removeForwardAndWait(forward.id)
      return null
    }
    if (identity.verdict === 'verified' || identity.verdict === 'unreachable') {
      if (identity.verdict === 'unreachable') {
        // Unreachable servers may be down or starting; this is not proof of a foreign server.
        console.warn(
          `[ssh] Managed Dolphin server did not answer through its tunnel: ${identity.detail}`
        )
      }
      return forward
    }
    await args.forwards.removeForwardAndWait(forward.id)
    // Token refusal from our pinned server is not a moved port; waking cannot repair pairing.
    if (identity.verdict === 'unpaired') {
      throw dolphindIdentityRefusal(remotePort, identity)
    }
    // Rereading the port cannot reach the pinned server once the slot itself serves another key.
    if (identity.verdict === 'replaced') {
      throw DolphindManagedIdentityError.replacedServer(identity.environment, identity.detail)
    }
    const reread =
      attempt === 0 && args.rereadRemotePort ? await args.rereadRemotePort() : remotePort
    if (reread === remotePort || !args.stillCurrent()) {
      throw dolphindIdentityRefusal(remotePort, identity)
    }
    remotePort = reread
  }
}

async function addCurrentForward(
  args: VerifiedDolphindForwardArgs,
  remotePort: number
): Promise<PortForwardEntry | null> {
  const forward = await args.forwards.addForward(
    args.targetId,
    args.connection,
    args.localPort,
    '127.0.0.1',
    remotePort,
    args.label
  )
  if (args.localPort !== 0 && forward.localPort !== args.localPort) {
    await args.forwards.removeForwardAndWait(forward.id)
    throw new Error('Managed Dolphin tunnel bound an unexpected local port.')
  }
  if (!args.stillCurrent()) {
    await args.forwards.removeForwardAndWait(forward.id)
    return null
  }
  return forward
}
