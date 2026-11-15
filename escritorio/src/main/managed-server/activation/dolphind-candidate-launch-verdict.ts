import { evaluateDolphindActivation, type DolphindActivationVerdict } from './dolphind-activation-gate'
import { dolphindActivationTransactionRoot } from './dolphind-activation-transaction'
import type { DolphindReadinessParse } from '../install/dolphind-remote-launch'
import {
  launchDolphindAndAwaitReadiness,
  type DolphindRemoteExecTarget
} from '../install/dolphind-remote-runtime-control'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'

type CandidateLaunchTarget = Parameters<typeof launchDolphindAndAwaitReadiness>[0] &
  DolphindRemoteExecTarget & {
    remoteHome: string
    nodePath: string
    userDataDir: string
    bindHost: string
    port: number
  }

/** Rethrow unconfirmed SSH cleanup: it provides no candidate evidence and must never mean rejection. */
export async function launchAndJudgeDolphindSlot(
  options: CandidateLaunchTarget,
  slot: { remoteInstallDir: string; fullVersion: string; buildHash: string }
): Promise<{ verdict: DolphindActivationVerdict; launchError: unknown }> {
  let parsed: DolphindReadinessParse | null = null
  let launchError: unknown
  try {
    parsed = await launchDolphindAndAwaitReadiness(options, {
      remoteInstallDir: slot.remoteInstallDir,
      nodePath: options.nodePath,
      fullVersion: slot.fullVersion,
      userDataDir: options.userDataDir,
      bindHost: options.bindHost,
      port: options.port,
      activationRoot: dolphindActivationTransactionRoot(options.host, options.remoteHome)
    })
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    launchError = error
  }
  const verdict = evaluateDolphindActivation(parsed?.state === 'ready' ? parsed.readiness : null, {
    buildHash: slot.buildHash,
    fullVersion: slot.fullVersion
  })
  return { verdict, launchError }
}
