/** Adopt serving unrecorded dolphind under the activation fence only when lock, readiness and installed build identify the same process. Never kill it without census; launching another loses the instance lock. Normal update admission handles version changes. */
import { DOLPHIND_LOCK_FILE_NAME } from '../../dolphind/dolphind-instance-lock'
import {
  parseDolphindInstanceLockRecord,
  type DolphindLockRecord
} from '../../dolphind/dolphind-instance-lock-record'
import { compareDolphindProcessIdentity } from '../../dolphind/dolphind-process-start-time'
import type { DolphindActivationRecord } from '../../managed-server/activation/dolphind-activation-record'
import {
  readDolphindActivationRecord,
  writeDolphindActivationRecord
} from '../../managed-server/activation/dolphind-activation-record-store'
import { evaluateDolphindActivation } from '../../managed-server/activation/dolphind-activation-gate'
import { withDolphindActivationLock } from '../../managed-server/activation/dolphind-activation-lock'
import { sameDolphindActivationRecord } from '../../managed-server/activation/dolphind-activation-transaction'
import { readDolphindActivationTransaction } from '../../managed-server/activation/dolphind-activation-transaction-store'
import { readRemoteDolphindManagedStopTarget } from '../../managed-server/lifecycle/dolphind-managed-remote-stop'
import {
  dolphindSlotDir,
  resolveDolphindSlotIdentity,
  type DolphindSlotOptions
} from '../../managed-server/activation/dolphind-recovery-slot'
import { DOLPHIND_PID_FILENAME } from '../../managed-server/install/dolphind-remote-host-support'
import {
  parseDolphindReadinessWaitOutput,
  readDolphindReadinessNowCommand
} from '../../managed-server/install/dolphind-remote-readiness-wait'
import { readBoundedDolphindRemoteRecord } from '../../managed-server/install/dolphind-remote-record-file'
import { execDolphindRemote } from '../../managed-server/install/dolphind-remote-runtime-control'
import {
  DOLPHIND_INSTALL_MODEL,
  remoteInstallDirName,
  remoteInstallVersionDirRegex
} from '../../managed-server/install/remote-install-model'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import {
  readWslGuestIdentity,
  wslGuestDolphindIncarnation,
  type WslGuestIdentity
} from '../execution/wsl-guest-process-identity'
import type { WslDolphindInstanceLockRead } from './wsl-dolphind-connect-state-snapshot'

const LOCK_RECORD_MAX_BYTES = 64 * 1024
const UNRECORDED_DOLPHIND_CODE = 'wsl_dolphind_unrecorded_instance_unverifiable'

export type WslDolphindAdoption =
  | { outcome: 'none' }
  | { outcome: 'adopted'; version: string; pid: number; record: DolphindActivationRecord }

export class WslDolphindUnrecordedInstanceError extends Error {
  readonly code = UNRECORDED_DOLPHIND_CODE
  constructor(message: string) {
    super(message)
    this.name = 'WslDolphindUnrecordedInstanceError'
  }
}

type LockHolder = { pid: number; version: string }

async function readLiveLockHolder(
  slot: DolphindSlotOptions,
  preRead?: WslDolphindInstanceLockRead
): Promise<LockHolder | null> {
  const lockPath = joinRemotePath(slot.host, slot.userDataDir, DOLPHIND_LOCK_FILE_NAME)
  const read =
    preRead ?? (await readBoundedDolphindRemoteRecord(slot, lockPath, LOCK_RECORD_MAX_BYTES))
  const lock = read.state === 'present' ? parseDolphindInstanceLockRecord(read.raw) : null
  // Desktop-role or malformed locks identify no dolphind to adopt.
  if (!lock || lock.role === 'desktop') {
    return null
  }
  // Adopt only proven-live holders; otherwise let the host's instance lock arbitrate launch.
  // The snapshot's identity counts only if it was read for this same pid.
  const known =
    preRead?.state === 'present' && preRead.holder?.pid === lock.pid ? preRead.holder.guest : null
  return (await lockHolderLiveness(slot, lock, known)) === 'live'
    ? { pid: lock.pid, version: lock.version }
    : null
}

type LockHolderLiveness = 'live' | 'unverifiable' | 'exited'

/** A PID is no identity after a distro restart reuses it: the lock's boot id and start ticks are. */
async function lockHolderLiveness(
  slot: DolphindSlotOptions,
  lock: DolphindLockRecord,
  known: WslGuestIdentity | null = null
): Promise<LockHolderLiveness> {
  const guest = known ?? (await readWslGuestIdentity(slot.conn, lock.pid))
  if (!guest) {
    return 'unverifiable'
  }
  const incarnation = wslGuestDolphindIncarnation(guest)
  // The guest answered, and no process has that PID.
  if (!incarnation) {
    return 'exited'
  }
  // Compare boot IDs case-insensitively because readers normalize them.
  const recorded = lock.bootId ? { ...lock, bootId: lock.bootId.toLowerCase() } : lock
  const verdict = compareDolphindProcessIdentity(lock.pid, recorded, {
    incarnation: () => incarnation,
    // Ignore wall-clock starts: guest clocks jump after host sleep.
    startedAtMs: () => null,
    platform: 'linux'
  })
  return verdict === 'matches' ? 'live' : verdict === 'differs' ? 'exited' : 'unverifiable'
}

async function readSlotPid(slot: DolphindSlotOptions, version: string): Promise<number | null> {
  const pidFile = joinRemotePath(slot.host, dolphindSlotDir(slot, version), DOLPHIND_PID_FILENAME)
  const raw = await execDolphindRemote(slot, `cat ${quotePosixShell(pidFile)} 2>/dev/null || true`)
  const pid = Number.parseInt(raw.trim(), 10)
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null
}

/** The holder's slot must publish readiness for this pid, from the build installed there. */
async function proveHolderServesItsSlot(
  slot: DolphindSlotOptions,
  holder: LockHolder
): Promise<void> {
  const label = `An dolphind (pid ${holder.pid}, ${holder.version}) is running in this distro but is not the recorded one`
  const dirName = remoteInstallDirName(DOLPHIND_INSTALL_MODEL, holder.version)
  if (!remoteInstallVersionDirRegex(DOLPHIND_INSTALL_MODEL).test(dirName)) {
    throw new WslDolphindUnrecordedInstanceError(`${label}, and its version is not a slot name.`)
  }
  const target = await readRemoteDolphindManagedStopTarget(slot, holder.version)
  if (target.state !== 'ready' || target.context.instance.pid !== holder.pid) {
    throw new WslDolphindUnrecordedInstanceError(
      `${label}, and it cannot be identified: ${target.state === 'refused' ? target.reason : 'its readiness names another process.'}`
    )
  }
  const identity = await resolveDolphindSlotIdentity(slot, holder.version)
  const readiness = parseDolphindReadinessWaitOutput(
    slot.host,
    await execDolphindRemote(slot, readDolphindReadinessNowCommand(slot.host, identity.remoteDir))
  )
  const verdict = evaluateDolphindActivation(
    readiness.state === 'ready' ? readiness.readiness : null,
    {
      buildHash: identity.buildHash,
      fullVersion: identity.version
    }
  )
  if (verdict.decision === 'reject') {
    throw new WslDolphindUnrecordedInstanceError(`${label}, and ${verdict.reason}`)
  }
}

function adoptedRecord(
  record: DolphindActivationRecord,
  version: string,
  now: Date
): DolphindActivationRecord {
  if (record.active === version) {
    return record
  }
  const { activeAppVersion, previousAppVersion: _previousAppVersion, ...rest } = record
  return {
    ...rest,
    active: version,
    previous: record.active ?? record.previous,
    ...(record.active && activeAppVersion ? { previousAppVersion: activeAppVersion } : {}),
    activatedAt: now.toISOString(),
    // Prelaunch snapshot belongs to another activation; rollback must not restore it.
    snapshot: null
  }
}

/** Adopt lock owners missing from record/pid file only with proof; otherwise refuse rather than launch into an occupied instance lock. */
export async function adoptUnrecordedWslDolphind(
  slot: DolphindSlotOptions,
  record: DolphindActivationRecord,
  now: () => Date = () => new Date(),
  /** This connect's snapshot of the lock; the fenced re-check below always reads the host. */
  preReadLock?: WslDolphindInstanceLockRead
): Promise<WslDolphindAdoption> {
  const holder = await readLiveLockHolder(slot, preReadLock)
  if (!holder) {
    return { outcome: 'none' }
  }
  if (
    record.active === holder.version &&
    (await readSlotPid(slot, holder.version)) === holder.pid
  ) {
    return { outcome: 'none' }
  }
  await proveHolderServesItsSlot(slot, holder)
  return withDolphindActivationLock(
    slot,
    async () => {
      const current = await readDolphindActivationRecord(slot)
      if (!sameDolphindActivationRecord(current, record)) {
        throw new WslDolphindUnrecordedInstanceError(
          'The activation record changed while an unrecorded dolphind was being adopted. Retry.'
        )
      }
      if (await readDolphindActivationTransaction(slot)) {
        throw new WslDolphindUnrecordedInstanceError(
          'An interrupted activation is pending, so an unrecorded dolphind cannot be adopted yet.'
        )
      }
      const again = await readLiveLockHolder(slot)
      if (again?.pid !== holder.pid || again.version !== holder.version) {
        throw new WslDolphindUnrecordedInstanceError(
          'The unrecorded dolphind changed while it was being adopted. Retry.'
        )
      }
      const pidFile = joinRemotePath(
        slot.host,
        dolphindSlotDir(slot, holder.version),
        DOLPHIND_PID_FILENAME
      )
      await execDolphindRemote(
        slot,
        `(umask 077 && printf '%s\\n' ${String(holder.pid)} > ${quotePosixShell(pidFile)})`
      )
      const next = adoptedRecord(current, holder.version, now())
      if (next !== current) {
        await writeDolphindActivationRecord(slot, next)
      }
      return {
        outcome: 'adopted' as const,
        version: holder.version,
        pid: holder.pid,
        record: next
      }
    },
    () => {
      throw new WslDolphindUnrecordedInstanceError(
        'Another Dolphin is changing this distro’s server, so an unrecorded dolphind cannot be adopted now.'
      )
    }
  )
}
