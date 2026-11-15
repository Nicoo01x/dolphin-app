/** Restore changed state only after proven slot exit and operator consent: a launched RPC server may have created terminals the stopped host cannot census, making the snapshot stale. Use the same rule for failure and crash recovery. */
import { execDolphindStateMutation } from '../host-state/dolphind-state-mutation-exec'
import { dolphindRemoteBaseDir } from '../install/dolphind-remote-windows-node'
import type { ServeReadiness } from '../../server/serve-readiness'
import { RELAY_REMOTE_DIR } from '../install/remote-install-root'
import { DOLPHIND_STATE_SNAPSHOT_DIR } from './dolphind-activation-record'
import type { DolphindSnapshotVerdict } from './dolphind-activation-transaction'
import {
  clearDolphindStateSnapshotMembersCommand,
  compareDolphindStateSnapshotCommand,
  dolphindSnapshotIsUnchanged,
  parseDolphindSnapshotRestore,
  restoreDolphindStateSnapshotCommand
} from '../host-state/dolphind-state-snapshot'
import { execDolphindRemote } from '../install/dolphind-remote-runtime-control'
import {
  ensureDolphindSlotServing,
  launchDolphindSlot,
  quiesceInterruptedDolphindSlot,
  type DolphindSlotIdentity,
  type DolphindSlotOptions
} from './dolphind-recovery-slot'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import { DOLPHIND_RECOVERY_CHANGED_STATE_CODE } from '../../../shared/dolphind-managed-runtime'

export type DolphindIncumbentRecoveryOptions = DolphindSlotOptions & {
  /** The operator accepted restoring the snapshot over state a launched build changed. */
  acceptChangedState?: boolean
}

type DolphindIncumbentRecovery =
  | { outcome: 'restored'; readiness: ServeReadiness | null }
  | { outcome: 'refused'; verdict: 'live' | 'unverifiable'; code: string; reason: string }

export function dolphindSnapshotPath(options: DolphindSlotOptions, dirName: string): string {
  return joinRemotePath(
    options.host,
    options.remoteHome,
    RELAY_REMOTE_DIR,
    DOLPHIND_STATE_SNAPSHOT_DIR,
    dirName
  )
}

/** Unverifiable steps throw so the caller retains the fence. */
export async function recoverDolphindIncumbent(
  options: DolphindIncumbentRecoveryOptions,
  input: {
    transactionStartedAt: string
    launchedVersion: string | null
    incumbent: DolphindSlotIdentity | null
    restoreState: DolphindSnapshotVerdict | null
    /** Rollback may restore a different snapshot from the launched slot's starting state. */
    launchedFromState?: DolphindSnapshotVerdict | null
    /** This run itself proved both slots exited, so no fresh liveness probe is needed. */
    slotsProvenExited?: boolean
  }
): Promise<DolphindIncumbentRecovery> {
  const quiescence =
    input.slotsProvenExited || !input.restoreState
      ? 'exited'
      : await quiesceInterruptedDolphindSlot(options, input.launchedVersion, input.incumbent)
  // With no incumbent there is no older reader to protect; the record names nothing to serve.
  if (quiescence === 'exited' && input.restoreState && input.incumbent) {
    const decision = input.launchedVersion
      ? await decideChangedStateRestore(options, input.launchedFromState ?? input.restoreState)
      : 'restore'
    if (decision !== 'restore' && decision !== 'unchanged') {
      return decision
    }
    // A launched slot that left its starting state untouched still sits on a root to replace.
    if (decision === 'restore' || input.launchedFromState) {
      await restoreState(options, input.restoreState)
    }
  }
  if (!input.incumbent) {
    return { outcome: 'restored', readiness: null }
  }
  return {
    outcome: 'restored',
    readiness: input.slotsProvenExited
      ? await launchDolphindSlot(options, input.incumbent)
      : await ensureDolphindSlotServing(options, input.incumbent)
  }
}

async function decideChangedStateRestore(
  options: DolphindIncumbentRecoveryOptions,
  state: DolphindSnapshotVerdict
): Promise<'unchanged' | 'restore' | Extract<DolphindIncumbentRecovery, { outcome: 'refused' }>> {
  if (state.state === 'captured') {
    const snapshotDir = dolphindSnapshotPath(options, state.dirName)
    // A lost read-only comparison can conservatively mean changed.
    const comparison = await execDolphindRemote(
      options,
      compareDolphindStateSnapshotCommand(
        options.host,
        options.userDataDir,
        snapshotDir,
        dolphindRemoteBaseDir(options.host, options.remoteHome)
      )
    ).catch(() => '')
    if (dolphindSnapshotIsUnchanged(comparison)) {
      return 'unchanged'
    }
  }
  if (options.acceptChangedState) {
    return 'restore'
  }
  const retained =
    state.state === 'captured' ? ` at ${dolphindSnapshotPath(options, state.dirName)}` : ''
  return {
    outcome: 'refused',
    verdict: 'unverifiable',
    code: DOLPHIND_RECOVERY_CHANGED_STATE_CODE,
    reason:
      'The launched build is stopped, but it changed profile state (or the change could not be ' +
      'checked), so the previous build was not restarted against it and this host serves ' +
      'nothing. Recover to restore the prelaunch snapshot' +
      `${retained} and restart the previous build; terminals the launched build started keep ` +
      'running but drop out of the restored state.'
  }
}

async function restoreState(options: DolphindSlotOptions, state: DolphindSnapshotVerdict): Promise<void> {
  if (state.state === 'pending') {
    throw new Error('The interrupted transaction has no durable snapshot verdict.')
  }
  const command =
    state.state === 'captured'
      ? restoreDolphindStateSnapshotCommand(
          options.host,
          options.userDataDir,
          dolphindSnapshotPath(options, state.dirName),
          dolphindRemoteBaseDir(options.host, options.remoteHome)
        )
      : clearDolphindStateSnapshotMembersCommand(
          options.host,
          options.userDataDir,
          dolphindRemoteBaseDir(options.host, options.remoteHome)
        )
  const restored = parseDolphindSnapshotRestore(await execDolphindStateMutation(options, command))
  if (restored !== 'restored') {
    throw new Error(`The prelaunch state could not be restored (${restored}).`)
  }
}
