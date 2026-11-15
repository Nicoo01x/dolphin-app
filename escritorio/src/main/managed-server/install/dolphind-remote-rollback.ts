// Rollback restores a pre-activation snapshot: older builds may not understand newer state.
// Stop, rescue, restore, then launch; the rescue and fenced journal allow recovery of interrupted steps.
import { logDolphindActivationOutcome } from '../activation/dolphind-activation-outcome-log'
import type { DolphindHostTransport } from './dolphind-host-transport'
import type { DolphindActivationRecord } from '../activation/dolphind-activation-record'
import type { DolphindTerminalCensus } from '../../../shared/dolphind-terminal-census'
import type { DolphindActivationVerdict } from '../activation/dolphind-activation-gate'
import type { DolphindDaemonProtocolFacts } from '../activation/dolphind-daemon-protocol-crossing'
import { readDolphindActivationRecord } from '../activation/dolphind-activation-record-store'
import { sameDolphindActivationRecord } from '../activation/dolphind-activation-transaction'
import type { RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import {
  resolveDolphindActivationReadinessTimeout,
  withDolphindActivationLock
} from '../activation/dolphind-activation-lock'
import { dolphindActivationFenceRefusal } from '../activation/dolphind-activation-fence-hold'
import { DOLPHIND_STARTUP_READINESS_TIMEOUT_MS } from '../../../shared/dolphind-profile-preflight'
import { rollbackDolphindLocked } from '../lifecycle/dolphind-rollback-transition'

export type DolphindRollbackOptions = {
  conn: DolphindHostTransport
  host: RemoteHostPlatform
  remoteHome: string
  record: DolphindActivationRecord
  nodePath: string
  userDataDir: string
  bindHost: string
  port: number
  census: DolphindTerminalCensus
  /** Close terminal admission, then recount under the host lock; any failure is unverifiable. */
  recountCensus: () => Promise<DolphindTerminalCensus>
  /** Reopen admission if rollback leaves the incumbent serving. */
  releaseIncumbentAdmission: () => Promise<void>
  /** Expected hash from the client's copy of the rollback target. */
  targetBuildHash: string
  /** Protocol facts from the same target bytes. */
  targetDaemonProtocol: DolphindDaemonProtocolFacts
  readinessTimeoutMs?: number
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  signal?: AbortSignal
}

export type DolphindRollbackResult =
  | {
      outcome: 'rolled-back'
      target: string
      discarded: string[]
      verdict: DolphindActivationVerdict
    }
  | { outcome: 'refused'; code: string; reason: string }
  | { outcome: 'failed'; code: string; reason: string }

export async function rollbackDolphind(
  input: DolphindRollbackOptions
): Promise<DolphindRollbackResult> {
  const options = {
    ...input,
    readinessTimeoutMs: resolveDolphindActivationReadinessTimeout(
      input.readinessTimeoutMs,
      DOLPHIND_STARTUP_READINESS_TIMEOUT_MS
    )
  }
  return logDolphindActivationOutcome(
    `rollback to ${options.record.previous ?? 'none'}`,
    () =>
      withDolphindActivationLock(
        options,
        async (lock) => {
          if (
            !sameDolphindActivationRecord(
              await readDolphindActivationRecord(options),
              options.record
            )
          ) {
            return {
              outcome: 'refused',
              code: 'dolphind_rollback_record_changed',
              reason:
                'The host activation record changed while this rollback was waiting. Refresh the ' +
                'host state and review the new rollback target before trying again.'
            }
          }
          return rollbackDolphindLocked(options, lock)
        },
        async () => {
          const { code, reason } = await dolphindActivationFenceRefusal(options, 'rollback')
          return { outcome: 'refused', code, reason }
        }
      ),
    ['rolled-back']
  )
}
