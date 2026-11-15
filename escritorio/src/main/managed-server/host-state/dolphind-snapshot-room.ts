/** Check snapshot room before stopping a serving incumbent (#30491). */
import { dolphindRemoteBaseDir } from '../install/dolphind-remote-windows-node'
import { execDolphindRemoteOr } from '../install/dolphind-remote-runtime-control'
import {
  DOLPHIND_STATE_SNAPSHOT_DIR,
  type DolphindActivationRecord
} from '../activation/dolphind-activation-record'
import {
  dolphindSnapshotShortfallKb,
  dolphindSnapshotShortfallMessage,
  dolphindSnapshotSpaceCommand,
  parseDolphindSnapshotSpace
} from './dolphind-state-snapshot-space'
import { joinRemotePath } from '../../ssh/remote-host/ssh-remote-platform'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import type { DolphindSlotOptions } from '../activation/dolphind-recovery-slot'

export const DOLPHIND_SNAPSHOT_SPACE_INSUFFICIENT_CODE = 'dolphind_snapshot_space_insufficient'

export function dolphindSnapshotsRoot(
  options: Pick<DolphindSlotOptions, 'host' | 'remoteHome'>
): string {
  return joinRemotePath(
    options.host,
    dolphindRemoteBaseDir(options.host, options.remoteHome),
    DOLPHIND_STATE_SNAPSHOT_DIR
  )
}

/** Unknown room proceeds to authoritative capture; return a refusal only for proven insufficient space. */
export async function dolphindSnapshotRoomRefusal(
  options: DolphindSlotOptions,
  record: DolphindActivationRecord,
  fullVersion: string
): Promise<string | null> {
  const baseDir = dolphindRemoteBaseDir(options.host, options.remoteHome)
  const command = dolphindSnapshotSpaceCommand(
    options.host,
    options.userDataDir,
    dolphindSnapshotsRoot(options),
    baseDir,
    record.snapshot ? [record.snapshot.dirName] : []
  )
  if (!command) {
    return null
  }
  const space = parseDolphindSnapshotSpace(await measureRoom(options, command))
  const shortfall = dolphindSnapshotShortfallKb(space)
  return space && shortfall !== null
    ? dolphindSnapshotShortfallMessage(space, shortfall, {
        userDataDir: options.userDataDir,
        baseDir,
        fullVersion,
        active: record.active
      })
    : null
}

async function measureRoom(options: DolphindSlotOptions, command: string): Promise<string> {
  try {
    return await execDolphindRemoteOr(options, command)
  } catch (error) {
    // Unconfirmed read-only cleanup leaves room unknown; capture decides, unless caller cancelled.
    if (isUnconfirmedSshCommandTermination(error) && !options.signal?.aborted) {
      return ''
    }
    throw error
  }
}
