/** Persist journals in owner-only profile sidecars: older profile schemas drop unknown fields but retain fences, so an in-profile journal could vanish on downgrade. Unreadable journals fail closed. */
import {
  MAX_DOLPHIND_MIGRATION_SOURCE_CUTOVERS,
  isRetainedDolphindMigrationSourceCutover,
  parseDolphindMigrationSourceCutover,
  type DolphindMigrationSourceCutover
} from '../../../shared/dolphind-migration/dolphind-migration-source-cutover'
import {
  createMigrationJournalDirectory,
  orderMigrationJournalChain
} from './migration-journal-directory'

class DolphindMigrationCutoverJournalUnreadableError extends Error {
  constructor(detail: string) {
    super(`The migration journal cannot be read, so the SSH host stays fenced: ${detail}`)
    this.name = 'DolphindMigrationCutoverJournalUnreadableError'
  }
}

type JournalChangeListener = (userDataPath: string) => void
let journalChangeListener: JournalChangeListener | null = null

export function setDolphindMigrationJournalChangeListener(
  listener: JournalChangeListener | null
): void {
  journalChangeListener = listener
}

const journals = createMigrationJournalDirectory({
  directoryName: 'dolphind-migration-cutovers',
  // A manifest carries catalog rows and dormant session state, never scrollback bytes.
  maxFileBytes: 16 * 1024 * 1024,
  parse: parseDolphindMigrationSourceCutover,
  unreadable: (detail) => new DolphindMigrationCutoverJournalUnreadableError(detail),
  onChange: (userDataPath) => journalChangeListener?.(userDataPath)
})

export function dolphindMigrationCutoverJournalDirectory(userDataPath: string): string {
  return journals.directory(userDataPath)
}

/** Never skip an unreadable or untrusted journal. */
export function listDolphindMigrationSourceCutovers(
  userDataPath: string
): DolphindMigrationSourceCutover[] {
  return journals.list(userDataPath)
}

export function findDolphindMigrationSourceCutoverForTarget(
  userDataPath: string,
  sshTargetId: string
): DolphindMigrationSourceCutover | null {
  const chain = listDolphindMigrationCutoverChainForTarget(userDataPath, sshTargetId)
  return chain.at(-1) ?? null
}

/** Oldest first; throws unless the target's journals form one chain of delta moves. */
export function listDolphindMigrationCutoverChainForTarget(
  userDataPath: string,
  sshTargetId: string
): DolphindMigrationSourceCutover[] {
  const matches = listDolphindMigrationSourceCutovers(userDataPath).filter(
    (cutover) => cutover.sshTargetId === sshTargetId
  )
  return orderMigrationJournalChain(
    matches,
    (detail) => new DolphindMigrationCutoverJournalUnreadableError(detail),
    `SSH target ${sshTargetId}`
  )
}

/** Flush before returning so later fence writes always have a durable journal. */
export function writeDolphindMigrationSourceCutover(
  userDataPath: string,
  cutover: DolphindMigrationSourceCutover
): void {
  const parsed = parseDolphindMigrationSourceCutover(cutover)
  const existing = listDolphindMigrationSourceCutovers(userDataPath)
  // Finished retained cutovers can wait two releases; only in-flight journals count toward the bound.
  const inFlight = existing.filter(
    (entry) => entry.phase !== 'source-retired' && !isRetainedDolphindMigrationSourceCutover(entry)
  )
  if (
    !existing.some((entry) => entry.migrationId === parsed.migrationId) &&
    inFlight.length >= MAX_DOLPHIND_MIGRATION_SOURCE_CUTOVERS
  ) {
    throw new Error('dolphind_migration_cutover_capacity_exceeded')
  }
  journals.write(userDataPath, parsed)
}

export function removeDolphindMigrationSourceCutover(
  userDataPath: string,
  migrationId: string
): void {
  journals.remove(userDataPath, migrationId)
}

export function removeDolphindMigrationJournalsForDestination(
  userDataPath: string,
  sshTargetId: string,
  environmentId: string
): void {
  for (const cutover of listDolphindMigrationSourceCutovers(userDataPath)) {
    if (cutover.sshTargetId === sshTargetId && cutover.destinationEnvironmentId === environmentId) {
      removeDolphindMigrationSourceCutover(userDataPath, cutover.migrationId)
    }
  }
}
