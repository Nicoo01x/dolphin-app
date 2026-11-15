// Open forwards prove no identity; require an authenticated status call from the pinned server.
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import {
  pairedRuntimeConnectionFromOffer,
  type PairedRuntimeConnection
} from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { DOLPHIND_MANAGED_REMOTE_PORT } from '../../../shared/dolphind-managed-runtime'
import {
  isRecoverableRemoteRuntimeConnectionError,
  toRemoteRuntimeClientErrorLike
} from '../../../shared/remote-runtime/remote-runtime-client-error-classification'
import { RemoteRuntimeClientError } from '../../../shared/remote-runtime/remote-runtime-client-error'
import {
  getPreferredPairedRuntimeConnection,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { verifyRuntimePairingIdentity } from '../../runtime/hosts/identity/runtime-environment-identity-verification'
import type { ServeReadiness } from '../../server/serve-readiness'
import { dolphindBoundPort } from './dolphind-managed-bound-port'
import { tunneledDolphindPairingCode } from './dolphind-tunneled-pairing'
import { DolphindManagedPairingRepairFailedError } from './dolphind-managed-pairing-repair-failure'
import { quotePosixShellUnlessPlain } from '../../../shared/shell/launch/shell-argument-quoting'
import { RUNTIME_SERVER_REPLACED_STATUS_CODE } from '../../../shared/remote-runtime/host-status/runtime-host-status'

/** Unreachable proves no identity; unpaired is a refusal sealed by the pinned server key. */
export type DolphindTunnelIdentity =
  | { verdict: 'verified' }
  | { verdict: 'foreign' | 'unreachable' | 'unpaired'; detail: string }

export const DOLPHIND_IDENTITY_MISMATCH_CODE = 'dolphind_identity_mismatch'

/** `foreign-port`: another process answered; `replaced-server`: the host's own slot serves another key. */
export type DolphindIdentityMismatchKind = 'foreign-port' | 'replaced-server'

export class DolphindManagedIdentityError extends Error {
  readonly code = DOLPHIND_IDENTITY_MISMATCH_CODE
  private constructor(
    readonly kind: DolphindIdentityMismatchKind,
    explanation: string,
    detail: string
  ) {
    super(`${DOLPHIND_IDENTITY_MISMATCH_CODE}: ${explanation}: ${detail}`)
    this.name = 'DolphindManagedIdentityError'
  }

  static foreignPort(remotePort: number, detail: string): DolphindManagedIdentityError {
    return new DolphindManagedIdentityError(
      'foreign-port',
      `the server on remote port ${remotePort} is not this host’s Dolphin server ` +
        '(another Dolphin may be using that port)',
      detail
    )
  }

  /** SSH access alone can't re-pin a different server key, so only the user can re-pair. */
  static replacedServer(
    environment: { id: string; name: string },
    detail: string
  ): DolphindManagedIdentityError {
    const environmentName = environment.name
    // Why the id: a name is free text, so pasting it into a shell could expand or pick another server.
    const selector = quotePosixShellUnlessPlain(environment.id)
    return new DolphindManagedIdentityError(
      'replaced-server',
      `${environmentName} is not the Dolphin server this desktop paired with (Dolphin now connects ` +
        'to the host as a different SSH user, or the server was reinstalled), so reconnecting ' +
        `won’t restore access. To pair with the host’s current server, open the ⋯ menu on ` +
        `${environmentName} in Settings › Remote Dolphin Servers and choose Forget… (or run ` +
        `\`dolphin environment forget --environment ${selector} --yes\`), then click ` +
        'Connect on the SSH host',
      detail
    )
  }
}

/** Status code of a refusal automatic retries can't clear (the pairing must change); null otherwise. */
export function managedDolphindRefusalNeedingUserCode(error: unknown): string | null {
  if (error instanceof DolphindManagedIdentityError && error.kind === 'replaced-server') {
    return RUNTIME_SERVER_REPLACED_STATUS_CODE
  }
  return error instanceof DolphindManagedPairingRepairFailedError ? 'unauthorized' : null
}

export const DOLPHIND_PAIRING_REJECTED_CODE = 'dolphind_pairing_rejected'

export class DolphindManagedPairingRejectedError extends Error {
  readonly code = DOLPHIND_PAIRING_REJECTED_CODE
  constructor(detail: string) {
    super(
      `${DOLPHIND_PAIRING_REJECTED_CODE}: this host’s Dolphin server no longer accepts ` +
        `this desktop's pairing (its saved devices were reset, or this desktop was removed ` +
        `there), so reconnecting alone won't restore access: ${detail}`
    )
    this.name = 'DolphindManagedPairingRejectedError'
  }
}

export function dolphindIdentityRefusal(
  remotePort: number,
  identity: Exclude<DolphindTunnelIdentity, { verdict: 'verified' }>
): Error {
  return identity.verdict === 'unpaired'
    ? new DolphindManagedPairingRejectedError(identity.detail)
    : DolphindManagedIdentityError.foreignPort(remotePort, identity.detail)
}

// Key rejection closes the socket instead of returning a status reply.
const FOREIGN_CLOSE_CODES = new Set([4001, 4003])

export function classifyDolphindTunnelIdentityFailure(error: unknown): DolphindTunnelIdentity {
  const detail = error instanceof Error ? error.message : String(error)
  // Only sealed access-grant refusals prove the pinned server answered.
  if (
    error instanceof RemoteRuntimeClientError &&
    error.code === 'unauthorized' &&
    error.pairingStage === 'access-grant'
  ) {
    return { verdict: 'unpaired', detail }
  }
  if (error instanceof RemoteRuntimeClientError && FOREIGN_CLOSE_CODES.has(error.closeCode ?? 0)) {
    return { verdict: 'foreign', detail }
  }
  return isRecoverableRemoteRuntimeConnectionError(toRemoteRuntimeClientErrorLike(error))
    ? { verdict: 'unreachable', detail }
    : { verdict: 'foreign', detail }
}

export async function verifyDolphindPairingIdentity(
  connection: PairedRuntimeConnection,
  expected: Pick<KnownRuntimeEnvironment, 'runtimeId' | 'pairedDeviceId'>
): Promise<DolphindTunnelIdentity> {
  try {
    await verifyRuntimePairingIdentity(connection, expected)
    return { verdict: 'verified' }
  } catch (error) {
    return classifyDolphindTunnelIdentityFailure(error)
  }
}

export function verifyManagedDolphindTunnelIdentity(
  environment: KnownRuntimeEnvironment
): Promise<DolphindTunnelIdentity> {
  if (!environment.dolphindDeployment) {
    return Promise.resolve({ verdict: 'verified' })
  }
  // Runtime/device IDs can change or become stale; pinned-key handshake and token acceptance prove identity.
  return verifyDolphindPairingIdentity(getPreferredPairedRuntimeConnection(environment), {
    runtimeId: null
  })
}

/** Fresh deploys have no saved pairing; reread readiness after foreign answers to follow port changes. */
export function deployedDolphindTunnelChecks(
  initial: ServeReadiness,
  rereadReadiness: () => Promise<ServeReadiness>
) {
  let readiness = initial
  return {
    readiness: () => readiness,
    remotePort: dolphindBoundPort(initial) ?? DOLPHIND_MANAGED_REMOTE_PORT,
    rereadRemotePort: async () => {
      readiness = await rereadReadiness()
      return dolphindBoundPort(readiness) ?? DOLPHIND_MANAGED_REMOTE_PORT
    },
    verify: async (localPort: number): Promise<DolphindTunnelIdentity> => {
      const pairing = parsePairingCode(tunneledDolphindPairingCode(readiness, localPort))
      return pairing
        ? verifyDolphindPairingIdentity(pairedRuntimeConnectionFromOffer(pairing), {
            runtimeId: readiness.runtimeId || null
          })
        : { verdict: 'foreign', detail: 'This host’s Dolphin server published an invalid pairing.' }
    }
  }
}
