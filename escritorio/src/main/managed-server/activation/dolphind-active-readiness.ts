import { evaluateDolphindActivation, type DolphindActivationExpectation } from './dolphind-activation-gate'
import {
  dolphindLivenessProbeCommand,
  parseDolphindLiveness,
  type DolphindLaunchSpec,
  type DolphindReadinessParse
} from '../install/dolphind-remote-launch'
import {
  execDolphindRemote,
  launchDolphindAndAwaitReadiness,
  type DolphindRemoteExecTarget
} from '../install/dolphind-remote-runtime-control'
import {
  parseDolphindReadinessWaitOutput,
  readDolphindReadinessNowCommand
} from '../install/dolphind-remote-readiness-wait'
import type { ServeReadiness } from '../../server/serve-readiness'
import { withDolphindLogTail } from '../install/dolphind-remote-log-tail'
import type { RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'

type DolphindReadinessFailureVerdict = 'exited' | 'unverifiable' | 'rejected'

export class DolphindActiveReadinessError extends Error {
  constructor(
    readonly verdict: DolphindReadinessFailureVerdict,
    message: string
  ) {
    super(message)
    this.name = 'DolphindActiveReadinessError'
  }
}

/** A launched dolphind that did not publish acceptable readiness; inspection failures stay the base error. */
export class DolphindLaunchReadinessError extends DolphindActiveReadinessError {
  constructor(verdict: DolphindReadinessFailureVerdict, message: string) {
    super(verdict, message)
    this.name = 'DolphindLaunchReadinessError'
  }
}

function gatedReadiness(
  parsed: DolphindReadinessParse,
  expectation: DolphindActivationExpectation,
  label: string
): ServeReadiness {
  const readiness = parsed.state === 'ready' ? parsed.readiness : null
  const verdict = evaluateDolphindActivation(readiness, expectation)
  if (verdict.decision === 'reject') {
    throw new DolphindActiveReadinessError(
      'rejected',
      `${label} failed its readiness check: ${verdict.reason}`
    )
  }
  if (!readiness) {
    throw new DolphindActiveReadinessError(
      'rejected',
      `${label} passed activation without a readiness payload.`
    )
  }
  const coverage = dolphindDaemonCoverageRefusal(readiness)
  if (coverage) {
    throw new DolphindActiveReadinessError('rejected', `${label} ${coverage}`)
  }
  return readiness
}

/** Require PTY self-test coverage, or handshake on platforms that cannot spawn-probe. Older slots without coverage metadata retain the identity-only gate. */
function dolphindDaemonCoverageRefusal(readiness: ServeReadiness): string | null {
  const health = readiness.health
  const coverage = health?.terminalDaemon?.selfTest?.coverage
  if (!health || coverage === undefined || coverage === 'pty-spawn') {
    return null
  }
  if (coverage === 'handshake' && health.platform === 'win32') {
    return null
  }
  return (
    `reported terminal-daemon coverage '${String(coverage)}', which does not prove a PTY can ` +
    `be created on ${health.platform}.`
  )
}

export async function probeActiveDolphindReadiness(
  target: DolphindRemoteExecTarget & { remoteInstallDir: string },
  expectation: DolphindActivationExpectation
): Promise<ServeReadiness> {
  assertActiveDolphindLive(
    await execDolphindRemote(target, dolphindLivenessProbeCommand(target.host, target.remoteInstallDir)),
    expectation
  )
  return activeDolphindReadinessFromOutput(
    target.host,
    await execDolphindRemote(
      target,
      readDolphindReadinessNowCommand(target.host, target.remoteInstallDir)
    ),
    expectation
  )
}

/** Throws unless the liveness probe's answer proves the active slot's process is running. */
export function assertActiveDolphindLive(
  livenessOutput: string,
  expectation: DolphindActivationExpectation
): void {
  const liveness = parseDolphindLiveness(livenessOutput)
  if (liveness === 'DEAD') {
    throw new DolphindActiveReadinessError(
      'exited',
      `dolphind ${expectation.fullVersion} is recorded active but its process has exited.`
    )
  }
  if (liveness === 'NEVER_LAUNCHED') {
    throw new DolphindActiveReadinessError(
      'exited',
      `dolphind ${expectation.fullVersion} is recorded active but was never started from its install directory.`
    )
  }
  if (liveness !== 'LIVE') {
    throw new DolphindActiveReadinessError(
      'unverifiable',
      `dolphind ${expectation.fullVersion} process state is unverifiable.`
    )
  }
}

export function activeDolphindReadinessFromOutput(
  host: RemoteHostPlatform,
  readinessOutput: string,
  expectation: DolphindActivationExpectation
): ServeReadiness {
  return gatedReadiness(
    parseDolphindReadinessWaitOutput(host, readinessOutput),
    expectation,
    'The active dolphind'
  )
}

/** Accept recovery/rollback launches only when they prove the expected build. */
export async function launchDolphindSlotAndAwaitReadiness(
  target: DolphindRemoteExecTarget & {
    readinessTimeoutMs?: number
    sleep?: (ms: number) => Promise<void>
  },
  spec: DolphindLaunchSpec,
  expectation: DolphindActivationExpectation
): Promise<ServeReadiness> {
  const parsed = await launchDolphindAndAwaitReadiness(target, spec)
  try {
    return gatedReadiness(parsed, expectation, `dolphind ${spec.fullVersion}`)
  } catch (error) {
    if (!(error instanceof DolphindActiveReadinessError)) {
      throw error
    }
    const message = await withDolphindLogTail(target, spec.remoteInstallDir, error.message)
    throw new DolphindLaunchReadinessError(error.verdict, message)
  }
}
