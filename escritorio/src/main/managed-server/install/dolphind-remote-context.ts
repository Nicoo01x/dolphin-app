import type { NodeRuntimeTarget } from '../../../shared/node-runtime-pin'
import type { SshTarget } from '../../../shared/ssh-types'
import type { DolphindActivationRecord } from '../activation/dolphind-activation-record'
import { readDolphindActivationRecord } from '../activation/dolphind-activation-record-store'
import { resolveDolphindRuntimeTarget } from '../lifecycle/dolphind-runtime-target'
import { LINUX_LIBC_FIRST_PROBE } from '../../node-runtime/linux-libc-probe'
import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import { prepareWindowsDolphindHost } from '../host-state/dolphind-windows-host-preparation'
import {
  isWslDolphindHostTarget,
  type DolphindHostTarget,
  type DolphindHostTransport
} from './dolphind-host-transport'
import {
  decideDolphindMachineHome,
  dolphindMachineDataRoot,
  dolphindMachineHomeDir,
  dolphindMachineHomeProbeCommand,
  dolphindMachineOwnershipUnresolvedMessage,
  parseDolphindMachineHomeProbe
} from '../host-state/dolphind-machine-home'
import {
  dolphindMachineClaimCommand,
  readDolphindMachineClaimAnswer
} from '../host-state/dolphind-machine-claim-command'
import { execDolphindRemote, type DolphindRemoteExecTarget } from './dolphind-remote-runtime-control'
import { readRemoteHomeCommand } from '../../ssh/remote-exec/ssh-remote-commands'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  normalizeRemoteHome,
  validateRemoteHome,
  type RemoteHostPlatform
} from '../../ssh/remote-host/ssh-remote-platform'
import { detectRemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform-detection'
import { DolphindHostUnsupportedError } from '../../dolphind/dolphind-host-unavailable'
import { rememberSshHostPlatform } from '../../ssh/remote-host/ssh-host-platform-memo'

/**
 * La carpeta de datos de Dolphin en el host, la misma que en esta máquina (`~/.dolphin`).
 * Why: hasta el 26/10 era `~/.orca`, que es la del DOLPHIN real; los dos se pisaban en un mismo host.
 */
export const DOLPHIN_REMOTE_USER_DATA_DIR = '.dolphin'

/** Defaults to SSH: most lifecycle code still reads SSH-only target fields. */
export type DolphindRemoteContext<Target extends DolphindHostTarget = SshTarget> = {
  activationRecord: DolphindActivationRecord
  /** Select a compatible runtime when host glibc is below the default pin's floor. */
  serverTarget: NodeRuntimeTarget
  connection: DolphindHostTransport
  host: RemoteHostPlatform
  /** Login or machine-specific home for shared-home isolation; userDataDir must follow the same owner. */
  remoteHome: string
  target: Target
  userDataDir: string
}

export async function resolveDolphindRemoteContext<Target extends DolphindHostTarget = SshTarget>(
  target: Target,
  connection: DolphindHostTransport,
  signal?: AbortSignal,
  detectedHost?: RemoteHostPlatform,
  /**
   * Facts the caller already read on this host. `loginHome` serves only login-home placement;
   * `firstLibcProbeOutput` answers the libc probe's first command, whose fallbacks still run.
   */
  known: {
    loginHome?: string
    firstLibcProbeOutput?: string
    /** Replaces the plain activation record read; WSL reads its connect snapshot here. */
    readActivationRecord?: (
      target: DolphindRemoteExecTarget & { remoteHome: string; userDataDir: string }
    ) => Promise<DolphindActivationRecord>
  } = {}
): Promise<DolphindRemoteContext<Target>> {
  const host = detectedHost ?? (await detectRemoteHostPlatform(connection, { signal }))
  if (!host) {
    throw new DolphindHostUnsupportedError(
      isWslDolphindHostTarget(target)
        ? 'Dolphin’s server doesn’t support this WSL distro’s platform. Use an x64 or arm64 Linux distro.'
        : 'Dolphin’s server doesn’t support this SSH host’s platform.'
    )
  }
  const remote = { conn: connection, host, signal }
  const { dolphindHome: remoteHome, userDataDir } = await resolveDolphindMachineHome(
    remote,
    !isWslDolphindHostTarget(target),
    known.loginHome
  )
  let firstLibcProbeOutput = known.firstLibcProbeOutput
  const serverTarget = await resolveDolphindRuntimeTarget({
    conn: connection,
    host,
    signal,
    ...(firstLibcProbeOutput === undefined
      ? {}
      : {
          exec: async (command: string) => {
            if (command === LINUX_LIBC_FIRST_PROBE && firstLibcProbeOutput !== undefined) {
              const output = firstLibcProbeOutput
              firstLibcProbeOutput = undefined
              return output
            }
            // The fallbacks run exactly as the default exec would.
            return execCommand(connection, command, { signal })
          }
        })
  })
  if (!isWslDolphindHostTarget(target)) {
    rememberSshHostPlatform(target.id, host, serverTarget)
  }
  if (isWindowsRemoteHost(host)) {
    // Prepare pinned Node before even reading activation state on Windows.
    await prepareWindowsDolphindHost({
      conn: connection,
      host,
      remoteHome,
      serverTarget,
      signal
    })
  }
  const activationRecord = await (known.readActivationRecord ?? readDolphindActivationRecord)({
    ...remote,
    remoteHome,
    userDataDir
  })
  return {
    activationRecord,
    serverTarget,
    connection,
    host,
    remoteHome,
    target,
    userDataDir
  }
}

/** Resolve per-machine state for shared POSIX homes; Windows and WSL retain login-home placement. */
export async function resolveDolphindMachineHome(
  remote: DolphindRemoteExecTarget,
  keyByMachine: boolean,
  knownLoginHome?: string
): Promise<{ loginHome: string; dolphindHome: string; userDataDir: string }> {
  const { host } = remote
  if (!keyByMachine || isWindowsRemoteHost(host)) {
    const loginHome = normalizeRemoteHome(
      knownLoginHome ?? (await execDolphindRemote(remote, readRemoteHomeCommand(host))),
      host
    )
    if (!validateRemoteHome(loginHome, host)) {
      throw new Error(`Remote home is not a valid path: ${loginHome.slice(0, 100)}`)
    }
    return {
      loginHome,
      dolphindHome: loginHome,
      userDataDir: joinRemotePath(host, loginHome, DOLPHIN_REMOTE_USER_DATA_DIR)
    }
  }
  const probe = parseDolphindMachineHomeProbe(
    await execDolphindRemote(remote, dolphindMachineHomeProbeCommand(host)),
    host
  )
  const { loginHome } = probe
  let decision = decideDolphindMachineHome(probe, host)
  if (decision.kind === 'unresolved') {
    throw new Error(
      dolphindMachineOwnershipUnresolvedMessage(
        decision.machineKey,
        probe.identity?.hostname ?? null,
        decision.cause
      )
    )
  }
  if (decision.kind === 'claim') {
    const won = readDolphindMachineClaimAnswer(
      await execDolphindRemote(
        remote,
        dolphindMachineClaimCommand(host, loginHome, decision.machineKey)
      )
    )
    if (won.state !== 'present') {
      throw new Error(won.message)
    }
    decision =
      won.machineKey === decision.machineKey
        ? { kind: 'login-home' }
        : { kind: 'machine-home', machineKey: decision.machineKey }
  }
  if (decision.kind === 'login-home') {
    return {
      loginHome,
      dolphindHome: loginHome,
      userDataDir: joinRemotePath(host, loginHome, DOLPHIN_REMOTE_USER_DATA_DIR)
    }
  }
  const dolphindHome = dolphindMachineHomeDir(host, loginHome, decision.machineKey)
  await execDolphindRemote(remote, `umask 077; mkdir -p ${quotePosixShell(dolphindHome)}`)
  return {
    loginHome,
    dolphindHome,
    userDataDir: dolphindMachineDataRoot(host, loginHome, decision.machineKey)
  }
}
