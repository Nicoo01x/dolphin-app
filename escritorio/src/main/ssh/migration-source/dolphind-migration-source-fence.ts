/** Persist journal, fence, then profile flush before remote calls. Crashes may leave a non-authoritative stale journal; a fence without a journal requires destination evidence before release. */
import { randomUUID } from 'node:crypto'
import { getManagedDolphindFenceEnvironmentId } from '../../../shared/managed-dolphind-ssh-owner'
import type { DolphindMigrationBlocker } from '../../../shared/dolphind-migration/dolphind-migration-preflight'
import {
  DOLPHIND_MIGRATION_SOURCE_CUTOVER_VERSION,
  type DolphindMigrationSourceCutover
} from '../../../shared/dolphind-migration/dolphind-migration-source-cutover'
import type { SshTarget } from '../../../shared/ssh-types'
import { assertDolphindMigrationRequestFits } from '../../managed-server/migration/catalog/dolphind-migration-request-budget'
import { createDolphindMigrationManifest } from '../../persistence/migrating-dolphind-catalog/dolphind-migration-manifest-export'
import {
  findDolphindMigrationSourceCutoverForTarget,
  removeDolphindMigrationSourceCutover,
  writeDolphindMigrationSourceCutover
} from '../../persistence/migrating-dolphind-catalog/dolphind-migration-cutover-journal'
import {
  confirmDolphindMigrationTerminalsUnderFence,
  type DolphindMigrationTerminalVerdict
} from './dolphind-migration-terminal-gate'
import type { SshTargetDolphindClaims } from '../targets/ssh-target-dolphind-claims'
import {
  isBlockingDolphindMigrationBlocker,
  preflightDolphindMigrationExport,
  type DolphindMigrationPreflightStore
} from '../targets/ssh-target-dolphind-preflight'
import { dolphindMigrationRefusalReason } from '../../managed-server/migration/cutover/dolphind-migration-refusal-reason'
import {
  preservesDolphindMigrationBridgedPanes,
  type DolphindMigrationPaneLeasePredicate
} from './dolphind-migration-bridged-panes'

export const DOLPHIND_MIGRATION_LEAVE_BEHIND_TERMINALS = 'dolphind_migration_leave_behind_terminals'
export const DOLPHIND_MIGRATION_LEAVE_BEHIND_TERMINALS_REASON =
  'Move anyway needs every terminal on this host closed first, and Dolphin could not confirm they all exited. Close them, or end them on the host, then connect again.'

export type DolphindMigrationFenceState =
  | { state: 'none' }
  | { state: 'fenced'; cutover: DolphindMigrationSourceCutover }
  /** Empty-host deploys record provisioning intent instead of a migration journal. */
  | { state: 'owned-by-deploy'; environmentId: string }
  /** Unexplained ownership requires recovery, never automatic release. */
  | { state: 'fenced-unverifiable'; environmentId: string }
  /** Stale journals grant no staging authority. */
  | { state: 'stale-journal'; cutover: DolphindMigrationSourceCutover }

/** Throws when the journal cannot be read: an unreadable record keeps the host fenced. */
export function resolveDolphindMigrationFence(
  userDataPath: string,
  target: SshTarget
): DolphindMigrationFenceState {
  const cutover = findDolphindMigrationSourceCutoverForTarget(userDataPath, target.id)
  const ownerEnvironmentId = getManagedDolphindFenceEnvironmentId(target)
  if (cutover) {
    return ownerEnvironmentId === cutover.destinationEnvironmentId &&
      target.generation === cutover.sshTargetGeneration
      ? { state: 'fenced', cutover }
      : { state: 'stale-journal', cutover }
  }
  if (!ownerEnvironmentId) {
    return { state: 'none' }
  }
  return target.dolphindProvisioning
    ? { state: 'owned-by-deploy', environmentId: ownerEnvironmentId }
    : { state: 'fenced-unverifiable', environmentId: ownerEnvironmentId }
}

export type DolphindMigrationFenceResult =
  | { outcome: 'fenced'; cutover: DolphindMigrationSourceCutover; resumed: boolean }
  | {
      outcome: 'refused'
      verdict: 'live' | 'unverifiable'
      code: string
      reason: string
      blockers?: DolphindMigrationBlocker[]
    }

export async function fenceDolphindMigrationSource(args: {
  userDataPath: string
  store: DolphindMigrationPreflightStore
  claims: SshTargetDolphindClaims
  targetId: string
  destinationEnvironmentId: string
  destinationName: string
  terminalProof: DolphindMigrationTerminalVerdict
  isBridgedPaneLease?: DolphindMigrationPaneLeasePredicate
  now?: () => Date
  signal?: AbortSignal
}): Promise<DolphindMigrationFenceResult> {
  const target = args.store.getSshTarget(args.targetId)
  if (!target) {
    return refuse('unverifiable', 'dolphind_migration_target_not_found', 'The SSH host is gone.')
  }
  const existing = resolveDolphindMigrationFence(args.userDataPath, target)
  if (existing.state === 'fenced') {
    return existing.cutover.destinationEnvironmentId === args.destinationEnvironmentId
      ? { outcome: 'fenced', cutover: existing.cutover, resumed: true }
      : refuse('live', 'dolphind_migration_in_progress', 'Another migration holds this SSH host.')
  }
  if (existing.state !== 'none') {
    return refuse(
      'unverifiable',
      `dolphind_migration_${existing.state.replaceAll('-', '_')}`,
      fenceStateReason(existing)
    )
  }
  const proof = args.terminalProof
  if (proof.verdict !== 'exited' && proof.verdict !== 'bridged') {
    return refuse(proof.verdict, 'dolphind_migration_terminals', proof.reason)
  }
  const preflight = preflightDolphindMigrationExport(
    args.store,
    target.id,
    undefined,
    proof.verdict === 'bridged' ? proof.bridgedPtyIds : []
  )
  if (!preflight.claimable) {
    return {
      ...refuse(
        // Only a proven blocker reads live; one that is merely unanswered stays unverifiable.
        preflight.blockers
          .filter(isBlockingDolphindMigrationBlocker)
          .every((blocker) => blocker.category === 'live-or-unverifiable')
          ? 'unverifiable'
          : 'live',
        'dolphind_migration_preflight_blocked',
        dolphindMigrationRefusalReason(preflight.blockers)
      ),
      blockers: preflight.blockers
    }
  }
  const generation = args.claims.ensureGeneration(target.id)
  const now = (args.now ?? (() => new Date()))().toISOString()
  const manifest = createDolphindMigrationManifest(
    args.store,
    { ...target, generation },
    { migrationId: randomUUID(), destinationEnvironmentId: args.destinationEnvironmentId }
  )
  if (
    proof.verdict === 'bridged' &&
    target.managedServerLeaveBehind &&
    !preservesDolphindMigrationBridgedPanes(
      manifest.payload,
      args.store.getSshRemotePtyLeases(target.id),
      proof.bridgedPtyIds,
      args.isBridgedPaneLease
    )
  ) {
    return refuse(
      proof.relayVerdict,
      DOLPHIND_MIGRATION_LEAVE_BEHIND_TERMINALS,
      DOLPHIND_MIGRATION_LEAVE_BEHIND_TERMINALS_REASON
    )
  }
  // Reject before journaling so an unsendable manifest cannot pin the fence.
  assertDolphindMigrationRequestFits({ manifest })
  const cutover: DolphindMigrationSourceCutover = {
    version: DOLPHIND_MIGRATION_SOURCE_CUTOVER_VERSION,
    migrationId: manifest.migrationId,
    phase: 'source-fenced',
    startedAt: now,
    updatedAt: now,
    destinationEnvironmentId: args.destinationEnvironmentId,
    destinationName: args.destinationName,
    sshTargetId: target.id,
    sshTargetGeneration: generation,
    manifestSha256: manifest.manifestSha256,
    provenPtyIds: proof.verdict === 'exited' ? proof.provenPtyIds : [],
    ...(proof.verdict === 'bridged' ? { bridgedPtyIds: proof.bridgedPtyIds } : {}),
    // Capture before commit; this journaled export is the evidence of what the destination receives.
    manifest
  }
  writeDolphindMigrationSourceCutover(args.userDataPath, cutover)
  args.claims.fenceForMigration(target.id, args.destinationEnvironmentId, generation)
  await args.claims.flush(args.signal)
  // Recheck under fence for terminals started after the original proof.
  const underFence = confirmDolphindMigrationTerminalsUnderFence(
    args.store,
    target.id,
    args.terminalProof
  )
  if (underFence.verdict !== 'exited' && underFence.verdict !== 'bridged') {
    await releaseUnstagedFence(args, cutover)
    return refuse(underFence.verdict, 'dolphind_migration_terminals', underFence.reason)
  }
  return { outcome: 'fenced', cutover, resumed: false }
}

type FenceReleaseArgs = {
  userDataPath: string
  claims: SshTargetDolphindClaims
  signal?: AbortSignal
}

async function releaseUnstagedFence(
  args: FenceReleaseArgs,
  cutover: DolphindMigrationSourceCutover
): Promise<void> {
  if (cutover.phase !== 'source-fenced') {
    throw new Error('dolphind_migration_fence_release_after_stage')
  }
  await releaseDolphindMigrationFence(args, cutover)
}

/** Drop owner before journal so an interrupted release leaves a harmless stale journal, never unexplained ownership. */
export async function releaseDolphindMigrationFence(
  args: FenceReleaseArgs,
  cutover: DolphindMigrationSourceCutover
): Promise<void> {
  args.claims.release(cutover.sshTargetId, cutover.destinationEnvironmentId)
  await args.claims.flush(args.signal)
  removeDolphindMigrationSourceCutover(args.userDataPath, cutover.migrationId)
}

/** Unregistered destinations could stage nothing; registered destinations must prove durable abort instead. */
export async function releaseUndeployedMigrationFence(args: {
  userDataPath: string
  claims: SshTargetDolphindClaims
  targetId: string
  isDestinationRegistered: (environmentId: string) => boolean
  signal?: AbortSignal
}): Promise<'released' | 'none'> {
  const cutover = findDolphindMigrationSourceCutoverForTarget(args.userDataPath, args.targetId)
  if (!cutover) {
    return 'none'
  }
  if (args.isDestinationRegistered(cutover.destinationEnvironmentId)) {
    throw new Error('dolphind_migration_destination_registered')
  }
  await releaseUnstagedFence(args, cutover)
  return 'released'
}

function fenceStateReason(state: DolphindMigrationFenceState): string {
  switch (state.state) {
    case 'owned-by-deploy':
      return 'Dolphin already runs on this SSH host.'
    case 'fenced-unverifiable':
      return 'This SSH host is held for a migration whose record is missing. Recover it from this host’s Dolphin server first.'
    case 'stale-journal':
      return 'A migration record names this SSH host but its fence is gone. Resolve that migration first.'
    case 'fenced':
    case 'none':
      return 'This SSH host is not in a state a migration can start from.'
  }
}

function refuse(
  verdict: 'live' | 'unverifiable',
  code: string,
  reason: string
): Extract<DolphindMigrationFenceResult, { outcome: 'refused' }> {
  return { outcome: 'refused', verdict, code, reason }
}
