import { uptime } from 'node:os'
import type { DolphindUnexpectedExit } from '../../shared/dolphind-unexpected-exit'
import type { DolphindLockRecord } from './dolphind-instance-lock'

/** A reclaimed dolphind lock from this boot means that run died; without boot evidence a reboot cannot be ruled out. */
export function reclaimedUnexpectedExit(
  holder: DolphindLockRecord,
  self: Pick<DolphindLockRecord, 'bootId'>,
  // Linux reads the kernel boot time; elsewhere the OS uptime gives it.
  bootStartedAtMs: number = Date.now() - uptime() * 1000
): DolphindUnexpectedExit | null {
  const sameBoot =
    holder.bootId && self.bootId
      ? holder.bootId === self.bootId
      : Date.parse(holder.acquiredAt) >= bootStartedAtMs
  return holder.role !== 'desktop' && sameBoot
    ? { pid: holder.pid, version: holder.version, acquiredAt: holder.acquiredAt }
    : null
}

let previousUnexpectedExit: DolphindUnexpectedExit | null = null
let runFailed = false

/** A fatal stop keeps the instance lock, so the next start reports this run as unexpected. */
export function markDolphindRunFailed(): void {
  runFailed = true
}

export function dolphindRunFailed(): boolean {
  return runFailed
}

/** Set once from the startup lock acquisition, before readiness publishes health. */
export function recordDolphindPreviousUnexpectedExit(exit: DolphindUnexpectedExit | null): void {
  previousUnexpectedExit = exit
}

export function dolphindPreviousUnexpectedExit(): DolphindUnexpectedExit | null {
  return previousUnexpectedExit
}
