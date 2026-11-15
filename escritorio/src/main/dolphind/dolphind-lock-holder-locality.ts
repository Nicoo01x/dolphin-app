import process from 'node:process'
import { profileStateAccessMachineIdentity } from '../persistence/profile-state/access/profile-state-access-identity'
import { readDolphindProcessIncarnation } from './dolphind-process-start-time'
import { DolphindInstanceLockError } from './dolphind-data-root-privacy'
import { dolphindCloneMachineHint, dolphindPeerIsLiveCloneMachine } from './dolphind-lock-clone-machine'
import {
  dolphindStaleLockReclaimCommand,
  type DolphindReclaimHintRuntime
} from '../../shared/dolphind-stale-lock-reclaim'

/** Match machine identity, then legacy boot identity; identity-less records require local-only storage. */
export function dolphindLockHolderLocality(
  holder: DolphindPeerMachine,
  self: DolphindPeerMachine,
  dataRootIsOnLocalDisk: () => boolean,
  platform: NodeJS.Platform = process.platform
): 'local' | 'foreign' | 'unknown' {
  if (holder.machineIdentity && self.machineIdentity) {
    if (holder.machineIdentity !== self.machineIdentity) {
      return 'foreign'
    }
    return dolphindPeerIsLiveCloneMachine(holder, self, dataRootIsOnLocalDisk, platform)
      ? 'unknown'
      : 'local'
  }
  if (holder.bootId && holder.bootId === self.bootId) {
    return 'local'
  }
  return dataRootIsOnLocalDisk() ? 'local' : 'unknown'
}

export type DolphindPeerMachine = {
  machineIdentity?: string
  bootId?: string
  /** Latest of the record's own timestamp and its heartbeat mtime. */
  writtenAtMs?: number
  bootStartedAtMs?: number
  nowMs?: number
}

export function currentDolphindPeerMachine(): DolphindPeerMachine {
  const machineIdentity = profileStateAccessMachineIdentity()
  const bootId = readDolphindProcessIncarnation(process.pid)?.bootId
  return { ...(machineIdentity ? { machineIdentity } : {}), ...(bootId ? { bootId } : {}) }
}

/** PIDs require a provable machine and boot match; unknown peers are never assumed exited. */
export function dolphindPeerPidIsJudgeableHere(
  peer: DolphindPeerMachine,
  self: DolphindPeerMachine,
  dataRootIsOnLocalDisk: () => boolean
): boolean {
  if (peer.bootId && self.bootId && peer.bootId !== self.bootId) {
    return false
  }
  return dolphindLockHolderLocality(peer, self, dataRootIsOnLocalDisk) === 'local'
}

export function dolphindLockHolderUnverifiableError(lock: {
  holder: string
  foreign: boolean
  /** The holder runs on another machine that reports this machine-id. */
  cloneMachine?: { role: 'dolphind' | 'desktop' }
  dataRoot: string
  lockPath: string
  /** Managed hosts may lack launchers on PATH, so name this runtime/entry in reclaim hints. */
  hintRuntime: DolphindReclaimHintRuntime | null
}): DolphindInstanceLockError {
  const command = dolphindStaleLockReclaimCommand(lock.dataRoot, lock.hintRuntime)
  const reclaim =
    process.platform === 'linux'
      ? `run \`${command}\` on the machine it ran on to check and clear it, or `
      : ''
  const cloneHint = lock.cloneMachine ? ` ${dolphindCloneMachineHint(lock.cloneMachine.role)}` : ''
  return new DolphindInstanceLockError(
    'dolphind_instance_lock_holder_unverifiable',
    `${lock.holder} holds the data root ${lock.dataRoot}${lock.foreign || lock.cloneMachine ? ' from another machine' : ''}. ` +
      'Dolphin cannot check from here whether it is still running, because this data root may be ' +
      `shared with other machines. Stop it there. If it is not running anywhere, ${reclaim}` +
      `delete ${lock.lockPath} once you are sure.${cloneHint}`
  )
}
