/** Journal durably before mutation so interrupted deploys can finish or recover. Release the fence only once the host is provably settled on one slot. */
import { dolphindRemoteBaseDir } from '../install/dolphind-remote-windows-node'
import { randomUUID } from 'node:crypto'
import type { DolphindDeployOptions, DolphindDeployResult } from '../install/dolphind-remote-deploy'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import {
  withActivatedVersion,
  type DolphindActivationRecord,
  type DolphindStateSnapshot
} from './dolphind-activation-record'
import {
  readDolphindActivationRecord,
  writeDolphindActivationRecord
} from './dolphind-activation-record-store'
import { launchAndJudgeDolphindSlot } from './dolphind-candidate-launch-verdict'
import { planDolphindUpdate } from './dolphind-update-plan'
import {
  type DolphindTerminalCensus,
  UNVERIFIABLE_DOLPHIND_TERMINAL_CENSUS
} from '../../../shared/dolphind-terminal-census'
import { runFencedStop } from './dolphind-fenced-stop'
import {
  censusNeedsHostDaemonProtocols,
  CURRENT_DOLPHIND_DAEMON_PROTOCOL
} from './dolphind-daemon-protocol-crossing'
import { DOLPHIND_LOG_FILENAME } from '../install/dolphind-remote-host-support'
import { dolphindSnapshotFailureReason } from '../host-state/dolphind-state-snapshot-space'
import {
  DOLPHIND_SNAPSHOT_SPACE_INSUFFICIENT_CODE,
  dolphindSnapshotRoomRefusal,
  dolphindSnapshotsRoot
} from '../host-state/dolphind-snapshot-room'
import {
  captureDolphindStateSnapshotCommand,
  dolphindSnapshotDirName,
  parseDolphindSnapshotCapture
} from '../host-state/dolphind-state-snapshot'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import { computeLocalDolphindBuildHash } from '../install/dolphind-local-build-hash'
import { preflightDolphindCandidate } from './dolphind-candidate-preflight'
import type { DolphindActivationLockControl } from './dolphind-activation-lock'
import type { DolphindActivateTransaction } from './dolphind-activation-transaction'
import {
  createDolphindActivationTransaction,
  withDolphindActivationCandidateReady,
  withDolphindActivationIncumbentStopped,
  withDolphindActivationSnapshot
} from './dolphind-activation-transaction-transitions'
import { writeDolphindActivationTransaction } from './dolphind-activation-transaction-store'
import {
  execDolphindRemoteOr,
  withoutAbortSignal
} from '../install/dolphind-remote-runtime-control'
import { execDolphindStateMutationOr } from '../host-state/dolphind-state-mutation-exec'
import {
  initialDolphindActivationAdmissionCommand,
  parseInitialDolphindActivationAdmission
} from './dolphind-initial-activation-admission'
import {
  dolphindSlotDir,
  resolveDolphindSlotIdentity,
  type DolphindSlotIdentity
} from './dolphind-recovery-slot'
import { dolphindSnapshotPath } from './dolphind-incumbent-recovery'
import {
  restartAfterSnapshotFailure,
  restoreAfterRejectedCandidate,
  stopTransactionIncumbent
} from './dolphind-transaction-incumbent'
import { withDolphindLogTail } from '../install/dolphind-remote-log-tail'
import { dolphindCandidateLaunchFailureCode } from '../../dolphind/dolphind-host-unavailable'
import { errorMessage } from '../../../shared/error-message'

type Outcome = Extract<DolphindDeployResult, { outcome: 'installed-not-activated' }>

export const DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE = 'dolphind_activation_policy_refused'

function countedLockedRecord(
  options: DolphindDeployOptions,
  record: DolphindActivationRecord
): boolean {
  const counted = options.censusRecord
  return (
    !counted || (counted.active === record.active && counted.activatedAt === record.activatedAt)
  )
}

export async function activateInstalledDolphind(
  options: DolphindDeployOptions & { localDolphindDir: string },
  fullVersion: string,
  remoteDir: string,
  lock: DolphindActivationLockControl
): Promise<DolphindDeployResult> {
  const now = options.now ?? ((): Date => new Date())
  const notActivated = (code: string, reason: string, startCheckFailed?: true): Outcome => ({
    outcome: 'installed-not-activated',
    fullVersion,
    code,
    reason,
    ...(startCheckFailed ? { startCheckFailed } : {})
  })
  const record = await readDolphindActivationRecord(options)
  const planFor = (
    census: DolphindTerminalCensus,
    hostDaemonProtocols?: readonly number[]
  ): ReturnType<typeof planDolphindUpdate> =>
    planDolphindUpdate({
      record,
      candidateVersion: fullVersion,
      census,
      candidateDaemonProtocol: CURRENT_DOLPHIND_DAEMON_PROTOCOL,
      ...(hostDaemonProtocols ? { hostDaemonProtocols } : {}),
      ...(options.force !== undefined ? { force: options.force } : {})
    })
  // A census of another incumbent cannot authorize stopping this one.
  const census = countedLockedRecord(options, record)
    ? options.census
    : UNVERIFIABLE_DOLPHIND_TERMINAL_CENSUS
  let plan = planFor(census)
  if (plan.action === 'noop') {
    return { outcome: 'already-active', fullVersion }
  }
  const refusal = options.admitRecord?.(record, fullVersion)
  if (refusal) {
    return notActivated(DOLPHIND_ACTIVATION_POLICY_REFUSED_CODE, refusal)
  }
  // Hosts predating the census protocol set cannot name mixed generations; the candidate can.
  const asksCandidate = censusNeedsHostDaemonProtocols(census)
  if (
    plan.action === 'defer' &&
    !(asksCandidate && plan.code === 'dolphind_update_daemon_protocol_unverifiable')
  ) {
    return notActivated(plan.code, plan.reason)
  }
  const preflight = await preflightDolphindCandidate(
    { ...options, remoteInstallDir: remoteDir, fullVersion },
    asksCandidate
  )
  if ('failure' in preflight) {
    return notActivated('dolphind_candidate_preflight_failed', preflight.failure, true)
  }
  const { hostDaemonProtocols } = preflight
  plan = planFor(census, hostDaemonProtocols)
  if (plan.action === 'defer') {
    return notActivated(plan.code, plan.reason)
  }

  let incumbent: DolphindSlotIdentity | null = null
  if (record.active) {
    try {
      incumbent = await resolveDolphindSlotIdentity(options, record.active)
    } catch (error) {
      if (isUnconfirmedSshCommandTermination(error)) {
        throw error
      }
      return notActivated(
        'dolphind_incumbent_identity_unverifiable',
        `The active dolphind ${record.active} build identity could not be verified before ` +
          `stopping it: ${errorMessage(error)} Nothing was stopped.`
      )
    }
  } else {
    const admission = parseInitialDolphindActivationAdmission(
      await execDolphindRemoteOr(
        options,
        initialDolphindActivationAdmissionCommand(
          options.host,
          options.userDataDir,
          remoteDir,
          options.nodePath
        )
      )
    )
    if (admission.decision === 'defer') {
      return notActivated(admission.code, admission.reason)
    }
  }

  // Scan snapshot room before recount so slow scans cannot outdate stop admission.
  const roomless = await dolphindSnapshotRoomRefusal(options, record, fullVersion)
  if (roomless) {
    return notActivated(DOLPHIND_SNAPSHOT_SPACE_INSUFFICIENT_CODE, roomless)
  }

  const startedAt = now()
  let transaction: DolphindActivateTransaction = createDolphindActivationTransaction({
    transactionId: randomUUID(),
    candidateVersion: fullVersion,
    appVersion: options.appVersion,
    recordBefore: record,
    snapshotDirName: dolphindSnapshotDirName(fullVersion, startedAt.getTime()),
    now: startedAt
  })
  const beginMutating = (): void => {
    lock.retainOnError()
    // After mutation starts, cancellation would strand a stopped host; finish or roll back.
    options = withoutAbortSignal(options)
  }
  if (incumbent) {
    // Recount immediately before stop; the initial census may predate a long upload.
    const fenced = await runFencedStop({
      recountCensus: () =>
        countedLockedRecord(options, record)
          ? options.recountCensus()
          : Promise.reject(new Error('not the incumbent this update counted')),
      releaseIncumbentAdmission: options.releaseIncumbentAdmission,
      now: () => now().getTime(),
      refuse: (recounted) => {
        const plan = planFor(recounted, hostDaemonProtocols)
        return plan.action === 'defer' ? notActivated(plan.code, plan.reason) : null
      },
      prepare: () => writeDolphindActivationTransaction(options, transaction),
      stale: () =>
        notActivated(
          'dolphind_update_terminal_census_unavailable',
          'The terminal count went stale before the current server could be stopped, so nothing ' +
            'was stopped. Dolphin will try the update again.'
        ),
      stop: () => {
        beginMutating()
        return stopTransactionIncumbent(options, incumbent, lock)
      },
      stopMayHaveBeenSent: (unstopped) => unstopped === null || unstopped.stopMayBeUnderway
    })
    if ('refused' in fenced) {
      return fenced.refused
    }
    if (fenced.stopped) {
      return notActivated(
        'dolphind_outgoing_stop_incomplete',
        `${fenced.stopped.reason} No snapshot was taken and the candidate was not started. Dolphin ` +
          'requires matching runtime readiness before signaling an incumbent and confirmed exit ' +
          'before snapshotting.'
      )
    }
  } else {
    await writeDolphindActivationTransaction(options, transaction)
    beginMutating()
  }
  transaction = withDolphindActivationIncumbentStopped(transaction, now())
  await writeDolphindActivationTransaction(options, transaction)

  // Wait for confirmed exit before snapshotting; a live SQLite WAL is not a backup boundary.
  const snapshotDir = dolphindSnapshotPath(options, transaction.snapshot.dirName)
  const captureOutput = await execDolphindStateMutationOr(
    options,
    captureDolphindStateSnapshotCommand(
      options.host,
      options.userDataDir,
      snapshotDir,
      dolphindRemoteBaseDir(options.host, options.remoteHome),
      {
        snapshotsRoot: dolphindSnapshotsRoot(options),
        keep: [transaction.snapshot.dirName, ...(record.snapshot ? [record.snapshot.dirName] : [])]
      }
    ),
    'FAILED'
  )
  const capture = parseDolphindSnapshotCapture(captureOutput)
  if (capture === 'failed') {
    const reason = dolphindSnapshotFailureReason(captureOutput)
    const restarted = incumbent
      ? ` The incumbent was stopped before snapshotting; ${await restartAfterSnapshotFailure(options, incumbent, lock)}`
      : ''
    throw new Error(
      `Could not snapshot ${options.userDataDir} before activating ${fullVersion}` +
        `${reason ? `: ${reason}` : ''}. Dolphin's persisted state carries no schema version, so ` +
        'without a snapshot a rollback has no way back. Refusing to activate. Fix what stops ' +
        `the copy (often a full disk or quota on ${dolphindRemoteBaseDir(options.host, options.remoteHome)}), ` +
        `then reconnect.${restarted}`
    )
  }
  const snapshot: DolphindStateSnapshot | null =
    capture === 'captured'
      ? {
          dirName: transaction.snapshot.dirName,
          takenBeforeVersion: fullVersion,
          readableByVersion: record.active,
          takenAt: startedAt.toISOString()
        }
      : null
  transaction = withDolphindActivationSnapshot(transaction, capture, now())
  await writeDolphindActivationTransaction(options, transaction)

  const { verdict, launchError } = await launchAndJudgeDolphindSlot(options, {
    remoteInstallDir: remoteDir,
    fullVersion,
    buildHash: computeLocalDolphindBuildHash(options.localDolphindDir)
  })
  if (verdict.decision === 'reject') {
    const [code, reason] =
      launchError === undefined
        ? [verdict.code, verdict.reason]
        : [
            dolphindCandidateLaunchFailureCode(launchError),
            `The candidate failed while starting: ${errorMessage(launchError)}`
          ]
    const restored = await restoreAfterRejectedCandidate(options, lock, {
      launchedDir: dolphindSlotDir(options, transaction.candidateVersion),
      launchedVersion: transaction.candidateVersion,
      transactionStartedAt: transaction.startedAt,
      incumbent,
      restoreState: transaction.snapshot
    })
    const located =
      `${reason} Candidate stderr is at ` +
      `${joinRemotePath(options.host, remoteDir, DOLPHIND_LOG_FILENAME)}. ${restored}`
    return notActivated(code, await withDolphindLogTail(options, remoteDir, located), true)
  }

  const recordAfter = withActivatedVersion(record, fullVersion, snapshot, now(), options.appVersion)
  transaction = withDolphindActivationCandidateReady(transaction, recordAfter, now())
  await writeDolphindActivationTransaction(options, transaction)
  await writeDolphindActivationRecord(options, recordAfter)
  return { outcome: 'installed-and-activated', fullVersion, verdict }
}
