import { dolphindRemoteBaseDir } from '../install/dolphind-remote-windows-node'
import { randomUUID } from 'node:crypto'
import type {
  DolphindRollbackOptions,
  DolphindRollbackResult
} from '../install/dolphind-remote-rollback'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import { withRolledBackVersion } from '../activation/dolphind-activation-record'
import { writeDolphindActivationRecord } from '../activation/dolphind-activation-record-store'
import { launchAndJudgeDolphindSlot } from '../activation/dolphind-candidate-launch-verdict'
import { assessDolphindRollback } from './dolphind-rollback-safety'
import { DOLPHIND_LOG_FILENAME } from '../install/dolphind-remote-host-support'
import {
  captureDolphindStateSnapshotCommand,
  dolphindRollbackRescueDirName,
  parseDolphindSnapshotCapture,
  parseDolphindSnapshotPresence,
  parseDolphindSnapshotRestore,
  probeDolphindStateSnapshotCommand,
  restoreDolphindStateSnapshotCommand
} from '../host-state/dolphind-state-snapshot'
import {
  newestStateMtimeCommand,
  parseNewestStateMtimeSeconds
} from '../host-state/dolphind-state-newest-mtime'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import type { DolphindActivationLockControl } from '../activation/dolphind-activation-lock'
import {
  rollbackStartingState,
  type DolphindRollbackTransaction
} from '../activation/dolphind-activation-transaction'
import {
  createDolphindRollbackTransaction,
  withDolphindRollbackPhase,
  withDolphindRollbackRescue
} from '../activation/dolphind-activation-transaction-transitions'
import { writeDolphindActivationTransaction } from '../activation/dolphind-activation-transaction-store'
import { ROLLBACK_STALE_COUNT, rollbackRecountRefusal } from './dolphind-rollback-admission'
import { runFencedStop } from '../activation/dolphind-fenced-stop'
import { execDolphindRemoteOr, withoutAbortSignal } from '../install/dolphind-remote-runtime-control'
import { execDolphindStateMutationOr } from '../host-state/dolphind-state-mutation-exec'
import {
  dolphindSlotDir,
  resolveDolphindSlotIdentity,
  type DolphindSlotIdentity
} from '../activation/dolphind-recovery-slot'
import { dolphindSnapshotPath } from '../activation/dolphind-incumbent-recovery'
import {
  putTransactionIncumbentBack,
  restoreAfterRejectedCandidate
} from '../activation/dolphind-transaction-incumbent'
import {
  readDolphindRollbackBarrierTarget,
  rollbackBarrierRefusal,
  stopIncumbentBehindTerminalBarrier
} from './dolphind-rollback-terminal-barrier'
import { withDolphindLogTail } from '../install/dolphind-remote-log-tail'
import { errorMessage } from '../../../shared/error-message'

async function stateWritesSinceActivation(
  options: DolphindRollbackOptions
): Promise<boolean | null> {
  const activatedAtSeconds = Math.floor(Date.parse(options.record.activatedAt ?? '') / 1000)
  if (!Number.isFinite(activatedAtSeconds)) {
    return null
  }
  const newest = parseNewestStateMtimeSeconds(
    await execDolphindRemoteOr(
      options,
      newestStateMtimeCommand(
        options.host,
        options.userDataDir,
        dolphindRemoteBaseDir(options.host, options.remoteHome)
      )
    )
  )
  return newest === null ? null : newest >= activatedAtSeconds
}

export async function rollbackDolphindLocked(
  options: DolphindRollbackOptions,
  lock: DolphindActivationLockControl
): Promise<DolphindRollbackResult> {
  const now = options.now ?? ((): Date => new Date())
  const snapshot = options.record.snapshot
  const presence = snapshot
    ? parseDolphindSnapshotPresence(
        await execDolphindRemoteOr(
          options,
          probeDolphindStateSnapshotCommand(
            options.host,
            dolphindSnapshotPath(options, snapshot.dirName),
            dolphindRemoteBaseDir(options.host, options.remoteHome)
          )
        )
      )
    : 'absent'
  const safety = assessDolphindRollback({
    record: options.record,
    snapshotPresent: presence === 'unverifiable' ? null : presence === 'present',
    census: options.census,
    targetDaemonProtocol: options.targetDaemonProtocol,
    stateWritesSinceActivation: await stateWritesSinceActivation(options)
  })
  if (safety.safety === 'unsafe') {
    return { outcome: 'refused', code: safety.code, reason: safety.reason }
  }
  if (!snapshot || !options.record.active) {
    return {
      outcome: 'refused',
      code: 'dolphind_rollback_no_active',
      reason: 'No dolphind version is active on this host, so there is nothing to roll back from.'
    }
  }
  let incumbent: DolphindSlotIdentity
  try {
    incumbent = await resolveDolphindSlotIdentity(options, options.record.active)
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    return {
      outcome: 'refused',
      code: 'dolphind_rollback_active_identity_unverifiable',
      reason: `The active dolphind identity could not be verified: ${errorMessage(error)} Nothing was changed.`
    }
  }

  const barrierTarget = await readDolphindRollbackBarrierTarget(options, incumbent.version)
  if (barrierTarget.state === 'refused') {
    return { outcome: 'refused', code: barrierTarget.code, reason: barrierTarget.reason }
  }
  const startedAt = now()
  let transaction: DolphindRollbackTransaction = createDolphindRollbackTransaction({
    transactionId: randomUUID(),
    incumbentVersion: incumbent.version,
    targetVersion: safety.target,
    recordBefore: options.record,
    recordAfter: withRolledBackVersion(options.record, startedAt),
    rescueDirName: dolphindRollbackRescueDirName(incumbent.version, startedAt.getTime()),
    now: startedAt
  })
  const fenced = await runFencedStop({
    recountCensus: options.recountCensus,
    releaseIncumbentAdmission: options.releaseIncumbentAdmission,
    now: () => now().getTime(),
    refuse: rollbackRecountRefusal,
    prepare: () => writeDolphindActivationTransaction(options, transaction),
    stale: () => ROLLBACK_STALE_COUNT,
    stop: async () => {
      lock.retainOnError()
      // Cancellation after mutation could strand a stopped host; finish or recover instead.
      options = withoutAbortSignal(options)
      // Pre-lock census can go stale; the fenced stop supplies the terminal-safety proof.
      return stopIncumbentBehindTerminalBarrier(
        options,
        transaction.transactionId,
        barrierTarget.context
      )
    },
    // Withdrawn stops leave the incumbent serving and needing admission reopened.
    stopMayHaveBeenSent: (barrier) => barrier.state !== 'withdrawn'
  })
  if ('refused' in fenced) {
    return fenced.refused
  }
  const blocked = rollbackBarrierRefusal(fenced.stopped)
  if (blocked) {
    if (blocked.retainFence) {
      lock.retain()
    }
    const recovered = blocked.restartIncumbent
      ? ` ${await putIncumbentBack(options, lock, transaction, incumbent)}`
      : ''
    return { outcome: blocked.outcome, code: blocked.code, reason: blocked.reason + recovered }
  }
  transaction = withDolphindRollbackPhase(transaction, 'incumbent-stopped', now())
  await writeDolphindActivationTransaction(options, transaction)

  const rescue = parseDolphindSnapshotCapture(
    await execDolphindStateMutationOr(
      options,
      captureDolphindStateSnapshotCommand(
        options.host,
        options.userDataDir,
        dolphindSnapshotPath(options, transaction.rescue.dirName),
        dolphindRemoteBaseDir(options.host, options.remoteHome)
      )
    )
  )
  if (rescue === 'failed') {
    const recovered = await putIncumbentBack(options, lock, transaction, incumbent)
    return {
      outcome: 'failed',
      code: 'dolphind_rollback_rescue_snapshot_failed',
      reason:
        'The current state could not be preserved in a rescue snapshot, so the data root was ' +
        `not replaced. ${recovered}`
    }
  }
  transaction = withDolphindRollbackRescue(transaction, rescue, now())
  await writeDolphindActivationTransaction(options, transaction)

  // Restore before launching: older builds must never load newer state.
  const restored = parseDolphindSnapshotRestore(
    await execDolphindStateMutationOr(
      options,
      restoreDolphindStateSnapshotCommand(
        options.host,
        options.userDataDir,
        dolphindSnapshotPath(options, snapshot.dirName),
        dolphindRemoteBaseDir(options.host, options.remoteHome)
      )
    )
  )
  if (restored !== 'restored') {
    const recovered = await putIncumbentBack(options, lock, transaction, incumbent)
    return {
      outcome: 'failed',
      code: 'dolphind_rollback_restore_failed',
      reason: `The pre-activation snapshot could not be restored (${restored}). ${recovered}`
    }
  }
  transaction = withDolphindRollbackPhase(transaction, 'rollback-state-restored', now())
  await writeDolphindActivationTransaction(options, transaction)

  const targetDir = dolphindSlotDir(options, safety.target)
  const { verdict, launchError } = await launchAndJudgeDolphindSlot(options, {
    remoteInstallDir: targetDir,
    fullVersion: safety.target,
    buildHash: options.targetBuildHash
  })
  if (verdict.decision === 'reject') {
    const reason =
      launchError === undefined
        ? verdict.reason
        : `It failed while starting: ${errorMessage(launchError)}`
    const recovered = await restoreAfterRejectedCandidate(options, lock, {
      launchedDir: targetDir,
      launchedVersion: safety.target,
      transactionStartedAt: transaction.startedAt,
      incumbent,
      restoreState: rescueVerdict(transaction),
      launchedFromState: rollbackStartingState(transaction)
    })
    return {
      outcome: 'failed',
      code: launchError === undefined ? verdict.code : 'dolphind_rollback_target_launch_failed',
      reason: await withDolphindLogTail(
        options,
        targetDir,
        `The rollback target ${safety.target} did not come up healthy: ${reason} ${recovered} ` +
          `Its stderr is at ${joinRemotePath(options.host, targetDir, DOLPHIND_LOG_FILENAME)}.`
      )
    }
  }

  // Until target readiness is proven, active must still identify the recoverable incumbent.
  transaction = withDolphindRollbackPhase(transaction, 'target-ready', now())
  await writeDolphindActivationTransaction(options, transaction)
  await writeDolphindActivationRecord(options, transaction.recordAfter)
  return {
    outcome: 'rolled-back',
    target: safety.target,
    discarded: safety.safety === 'lossy' ? safety.discards : [],
    verdict
  }
}

type RestoreState = Parameters<typeof putTransactionIncumbentBack>[2]['restoreState']

function rescueVerdict(transaction: DolphindRollbackTransaction): RestoreState {
  return transaction.rescue.state === 'pending' ? null : transaction.rescue
}

async function putIncumbentBack(
  options: DolphindRollbackOptions,
  lock: DolphindActivationLockControl,
  transaction: DolphindRollbackTransaction,
  incumbent: DolphindSlotIdentity
): Promise<string> {
  const failure = await putTransactionIncumbentBack(options, lock, {
    transactionStartedAt: transaction.startedAt,
    launchedVersion: null,
    incumbent,
    restoreState: rescueVerdict(transaction)
  })
  return failure ?? `dolphind ${incumbent.version} was restored and is serving again.`
}
