// Preferred ports may belong to other runtimes; tunnel to the active slot's published bound port.
import {
  getRuntimeSshAccess,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { SshTarget } from '../../../shared/ssh-types'
import type { ServeReadiness } from '../../server/serve-readiness'
import { managedDolphindInstallDir } from './dolphind-managed-runtime-context'
import { resolveDolphindRemoteContext } from '../install/dolphind-remote-context'
import {
  parseDolphindReadinessWaitOutput,
  readDolphindReadinessNowCommand
} from '../install/dolphind-remote-readiness-wait'
import {
  execDolphindRemote,
  type DolphindRemoteExecTarget
} from '../install/dolphind-remote-runtime-control'
import type { DolphindHostTarget, DolphindHostTransport } from '../install/dolphind-host-transport'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'

export type DolphindTunnelPortInput = {
  environment: KnownRuntimeEnvironment
  target: SshTarget
  connection: DolphindHostTransport
}

export function dolphindBoundPort(readiness: Pick<ServeReadiness, 'boundEndpoint'>): number | null {
  if (!readiness.boundEndpoint) {
    return null
  }
  try {
    const port = Number(new URL(readiness.boundEndpoint).port)
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null
  } catch {
    return null
  }
}

async function readManagedDolphindSlotReadiness(
  target: DolphindRemoteExecTarget & { remoteInstallDir: string }
): Promise<ServeReadiness | null> {
  const parsed = parseDolphindReadinessWaitOutput(
    target.host,
    await execDolphindRemote(
      target,
      readDolphindReadinessNowCommand(target.host, target.remoteInstallDir)
    )
  )
  return parsed.state === 'ready' ? parsed.readiness : null
}

export async function readActiveManagedDolphindReadiness(input: {
  target: DolphindHostTarget
  connection: DolphindHostTransport
}): Promise<ServeReadiness | null> {
  const context = await resolveDolphindRemoteContext(input.target, input.connection)
  const active = context.activationRecord.active
  if (!active) {
    return null
  }
  return readManagedDolphindSlotReadiness({
    conn: context.connection,
    host: context.host,
    remoteHome: context.remoteHome,
    remoteInstallDir: managedDolphindInstallDir(context, active)
  })
}

async function readActiveSlotBoundPort(input: DolphindTunnelPortInput): Promise<number | null> {
  if (!input.environment.dolphindDeployment) {
    return null
  }
  const readiness = await readActiveManagedDolphindReadiness(input)
  return readiness ? dolphindBoundPort(readiness) : null
}

export async function resolveManagedDolphindTunnelPort(input: DolphindTunnelPortInput): Promise<number> {
  const access = getRuntimeSshAccess(input.environment)
  if (!access) {
    throw new Error('Managed dolphind environment is missing its SSH tunnel dependency.')
  }
  try {
    return (await readActiveSlotBoundPort(input)) ?? access.remotePort
  } catch (error) {
    // Post-forward identity validation still detects a wrong server when falling back.
    console.warn(
      '[ssh] Could not read the managed Dolphin server port; trying the preferred one:',
      error
    )
    return access.remotePort
  }
}

/** Missing or unreadable published ports never justify moving an existing tunnel. */
export async function readManagedDolphindPublishedPort(
  input: DolphindTunnelPortInput
): Promise<number | null> {
  try {
    return await readActiveSlotBoundPort(input)
  } catch {
    return null
  }
}

/** The server key the active slot offers to new pairings; null when unpublished or unreadable. */
export async function readManagedDolphindPublishedKey(
  input: DolphindTunnelPortInput
): Promise<string | null> {
  if (!input.environment.dolphindDeployment) {
    return null
  }
  try {
    const readiness = await readActiveManagedDolphindReadiness(input)
    return readiness?.pairing.available
      ? (parsePairingCode(readiness.pairing.url)?.publicKeyB64 ?? null)
      : null
  } catch {
    return null
  }
}
