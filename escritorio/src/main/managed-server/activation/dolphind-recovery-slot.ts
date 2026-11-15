/** Only positive host evidence proves slot exit. Unanswered probes stay unverifiable and never authorize starting a second slot. */
import type { ServeReadiness } from '../../server/serve-readiness'
import type { DolphindActivationExpectation } from './dolphind-activation-gate'
import { DOLPHIND_INSTALL_MODEL } from '../install/remote-install-model'
import { computeRemoteInstallDir } from '../install/remote-versioned-install'
import { readRemoteDolphindBuildHash } from '../install/dolphind-remote-build-hash'
import {
  launchDolphindSlotAndAwaitReadiness,
  DolphindActiveReadinessError,
  probeActiveDolphindReadiness
} from './dolphind-active-readiness'
import {
  dolphindLivenessProbeCommand,
  dolphindLivenessProvenExited,
  parseDolphindLiveness,
  type DolphindLiveness
} from '../install/dolphind-remote-launch'
import {
  parseDolphindStopOutcome,
  stopDolphindCommand,
  type DolphindStopOutcome
} from '../install/dolphind-remote-process-control'
import {
  execDolphindRemote,
  type DolphindRemoteExecTarget
} from '../install/dolphind-remote-runtime-control'
import { dolphindActivationTransactionRoot } from './dolphind-activation-transaction'
import {
  initialDolphindActivationAdmissionCommand,
  parseInitialDolphindActivationAdmission
} from './dolphind-initial-activation-admission'

export const DOLPHIND_SLOT_STOP_WAIT_SECONDS = 20

export type DolphindSlotOptions = DolphindRemoteExecTarget & {
  remoteHome: string
  /** Host Node for legacy slots only; a slot's own runtime marker wins. */
  nodePath: string
  userDataDir: string
  bindHost: string
  port: number
  readinessTimeoutMs?: number
  sleep?: (ms: number) => Promise<void>
}

export type DolphindSlotIdentity = { version: string; remoteDir: string; buildHash: string }

function expectation(identity: DolphindSlotIdentity): DolphindActivationExpectation {
  return { buildHash: identity.buildHash, fullVersion: identity.version }
}

export function dolphindSlotDir(options: DolphindSlotOptions, version: string): string {
  return computeRemoteInstallDir(DOLPHIND_INSTALL_MODEL, options.remoteHome, version)
}

/** Hash installed bytes so readiness must prove the same build. */
export async function resolveDolphindSlotIdentity(
  options: DolphindSlotOptions,
  version: string
): Promise<DolphindSlotIdentity> {
  const remoteDir = dolphindSlotDir(options, version)
  return { version, remoteDir, buildHash: await readRemoteDolphindBuildHash(options, remoteDir) }
}

export function launchDolphindSlot(
  options: DolphindSlotOptions,
  identity: DolphindSlotIdentity
): Promise<ServeReadiness> {
  return launchDolphindSlotAndAwaitReadiness(
    options,
    {
      remoteInstallDir: identity.remoteDir,
      nodePath: options.nodePath,
      fullVersion: identity.version,
      userDataDir: options.userDataDir,
      bindHost: options.bindHost,
      port: options.port,
      // Every SSH launch is client-managed, so every one may idle out and be woken on connect.
      activationRoot: dolphindActivationTransactionRoot(options.host, options.remoteHome)
    },
    expectation(identity)
  )
}

/** Proves the slot serves, starting it only on proven exit. */
export async function ensureDolphindSlotServing(
  options: DolphindSlotOptions,
  identity: DolphindSlotIdentity
): Promise<ServeReadiness> {
  const liveness = parseDolphindLiveness(
    await execDolphindRemote(
      options,
      dolphindLivenessProbeCommand(options.host, identity.remoteDir)
    )
  )
  if (liveness === 'LIVE') {
    return probeActiveDolphindReadiness(
      { ...options, remoteInstallDir: identity.remoteDir },
      expectation(identity)
    )
  }
  if (!dolphindLivenessProvenExited(liveness)) {
    throw new DolphindActiveReadinessError(
      'unverifiable',
      `dolphind ${identity.version} process state is unverifiable.`
    )
  }
  return launchDolphindSlot(options, identity)
}

/** `justLaunched` only for a slot this run started; otherwise the readiness PID must agree. */
export async function stopDolphindSlot(
  options: DolphindSlotOptions,
  remoteDir: string,
  justLaunched: boolean
): Promise<DolphindStopOutcome> {
  return parseDolphindStopOutcome(
    await execDolphindRemote(
      options,
      stopDolphindCommand(
        options.host,
        remoteDir,
        justLaunched
          ? { waitSeconds: DOLPHIND_SLOT_STOP_WAIT_SECONDS, justLaunched: true }
          : { waitSeconds: DOLPHIND_SLOT_STOP_WAIT_SECONDS, nodePath: options.nodePath }
      )
    )
  )
}

type DolphindSlotQuiescence = 'exited' | 'other-slot-serving'

/** Prove candidate exit before replacing state and rule out another running slot, unless it already serves. Missing PID files prove nothing: SSH may drop after nohup but before $! is recorded, so inspect data-root ownership. */
export async function quiesceInterruptedDolphindSlot(
  options: DolphindSlotOptions,
  /** `null` when nothing was launched, so only `otherSlot` needs ruling out. */
  version: string | null,
  otherSlot: DolphindSlotIdentity | null
): Promise<DolphindSlotQuiescence> {
  const remoteDir = version === null ? null : dolphindSlotDir(options, version)
  const stopped =
    remoteDir === null ? 'already-exited' : await stopDolphindSlot(options, remoteDir, false)
  let exited = stopped === 'stopped' || stopped === 'already-exited'
  if ((stopped === 'unknown' || stopped === 'unconfirmed') && remoteDir !== null) {
    // No verified answer, e.g. the slot died before readiness; liveness decides.
    exited = dolphindLivenessProvenExited(await slotLiveness(options, remoteDir))
  }
  if (otherSlot) {
    const other = await slotLiveness(options, otherSlot.remoteDir)
    if (other === 'LIVE' && (exited || stopped === 'no-pid')) {
      // The serving slot holds the instance lock, so a PID-less launch cannot own the state.
      await probeActiveDolphindReadiness(
        { ...options, remoteInstallDir: otherSlot.remoteDir },
        expectation(otherSlot)
      )
      return 'other-slot-serving'
    }
    if (!dolphindLivenessProvenExited(other)) {
      throw new DolphindActiveReadinessError(
        'unverifiable',
        `dolphind ${version ?? 'candidate'} (${stopped}) and ${otherSlot.version} (${other}) cannot both be ` +
          'ruled out as owners of the shared state; it was not replaced.'
      )
    }
  }
  if (!exited && stopped === 'no-pid' && remoteDir !== null) {
    const admission = parseInitialDolphindActivationAdmission(
      await execDolphindRemote(
        options,
        initialDolphindActivationAdmissionCommand(
          options.host,
          options.userDataDir,
          remoteDir,
          options.nodePath
        )
      )
    )
    exited = admission.decision === 'proceed'
  }
  if (!exited) {
    throw new DolphindActiveReadinessError(
      'unverifiable',
      `dolphind ${version ?? 'candidate'} could not be confirmed stopped (${stopped}); replacing its state would be unsafe.`
    )
  }
  return 'exited'
}

export async function slotLiveness(
  options: DolphindSlotOptions,
  remoteDir: string
): Promise<DolphindLiveness> {
  return parseDolphindLiveness(
    await execDolphindRemote(options, dolphindLivenessProbeCommand(options.host, remoteDir))
  )
}
