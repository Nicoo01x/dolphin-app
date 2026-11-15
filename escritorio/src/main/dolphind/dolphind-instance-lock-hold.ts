// Holding the lock means re-proving it on every heartbeat, not only at acquisition.
import { statSync, unlinkSync, utimesSync } from 'node:fs'
import { startDolphindLockHeartbeat } from './dolphind-lock-clone-machine'
import { readBoundedLockFile } from './dolphind-instance-lock-reclaim'
import {
  describeLockHolder,
  parseDolphindInstanceLockRecord,
  type DolphindLockRecord
} from './dolphind-instance-lock-record'
import type { DolphindUnexpectedExit } from '../../shared/dolphind-unexpected-exit'

export type DolphindInstanceLock = {
  readonly path: string
  readonly record: DolphindLockRecord
  readonly previousUnexpectedExit: DolphindUnexpectedExit | null
  /** `keepUnexpectedExit` puts back the crashed run's record this lock reclaimed, so the next
   * start still reports that run; for one-shot tools that must not consume the notice. */
  release(options?: { keepUnexpectedExit?: boolean }): void
}

type DolphindLockBeat = 'held' | 'lost' | 'unproven'

function lockIsAbsent(lockPath: string): boolean {
  try {
    return !statSync(lockPath, { throwIfNoEntry: false })
  } catch {
    // Unstattable (e.g. a Windows delete-pending file) proves nothing; the next beat retries.
    return false
  }
}

/** Re-assert ownership: a removed lock lets the next starter in, so re-publish it or yield to its new holder. */
function beatDolphindInstanceLock(
  lockPath: string,
  record: DolphindLockRecord,
  publish: () => boolean
): DolphindLockBeat {
  let current = readBoundedLockFile(lockPath)
  if (current === null && lockIsAbsent(lockPath)) {
    try {
      if (publish()) {
        console.warn(
          `[dolphind] The instance lock ${lockPath} was removed while dolphind ran; restored it.`
        )
        return 'held'
      }
    } catch (error) {
      console.warn('[dolphind] could not restore the removed instance lock:', error)
      return 'unproven'
    }
    // Another starter published between the read and the restore.
    current = readBoundedLockFile(lockPath)
  }
  const holder = parseDolphindInstanceLockRecord(current ?? '')
  if (!holder) {
    // Starters refuse unreadable records, and torn ones show up as a new holder by the next beat.
    console.warn(`[dolphind] could not read the instance lock ${lockPath} to confirm ownership`)
    return 'unproven'
  }
  if (holder.nonce !== record.nonce) {
    console.error(
      `[dolphind] ${describeLockHolder(holder)} (pid ${holder.pid}) took over the instance lock ` +
        `${lockPath}.`
    )
    return 'lost'
  }
  try {
    const now = new Date()
    utimesSync(lockPath, now, now)
  } catch (error) {
    // A stalled heartbeat lets a machine sharing this machine-id take the lock.
    console.warn('[dolphind] could not refresh the instance lock heartbeat:', error)
  }
  return 'held'
}

export function holdDolphindInstanceLock(
  lockPath: string,
  record: DolphindLockRecord,
  publish: () => boolean,
  {
    previousUnexpectedExit,
    restoreReclaimedRecord,
    onExclusivityLost
  }: {
    previousUnexpectedExit: DolphindUnexpectedExit | null
    /** Republishes the reclaimed record without overwriting a successor's lock. */
    restoreReclaimedRecord?: () => void
    onExclusivityLost: () => void
  }
): DolphindInstanceLock {
  let released = false
  const stopHeartbeat = startDolphindLockHeartbeat(() => {
    if (beatDolphindInstanceLock(lockPath, record, publish) === 'lost') {
      stopHeartbeat()
      onExclusivityLost()
    }
  })
  return {
    path: lockPath,
    record,
    previousUnexpectedExit,
    release: (options) => {
      if (released) {
        return
      }
      released = true
      stopHeartbeat()
      // Re-read ownership before unlinking so a successor’s live runtime cannot be unlocked.
      const current = parseDolphindInstanceLockRecord(readBoundedLockFile(lockPath) ?? '')
      if (!current || current.nonce !== record.nonce) {
        return
      }
      try {
        unlinkSync(lockPath)
      } catch {
        // Dead-PID leftovers can be reclaimed on the next start.
      }
      if (options?.keepUnexpectedExit && previousUnexpectedExit) {
        restoreReclaimedRecord?.()
      }
    }
  }
}
