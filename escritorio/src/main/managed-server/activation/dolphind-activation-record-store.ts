// Unreadable activation records must fail closed; treating them as absent could overwrite a live install and its rollback target.
import type { DolphindHostTransport } from '../install/dolphind-host-transport'
import { RELAY_REMOTE_DIR } from '../install/remote-install-root'
import {
  DOLPHIND_ACTIVATION_FILENAME,
  emptyDolphindActivationRecord,
  parseDolphindActivationRecord,
  serializeDolphindActivationRecord,
  type DolphindActivationReadResult,
  type DolphindActivationRecord
} from './dolphind-activation-record'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import {
  readBoundedDolphindRemoteRecord,
  writeAtomicDolphindRemoteRecord
} from '../install/dolphind-remote-record-file'

const DOLPHIND_ACTIVATION_RECORD_MAX_BYTES = 64 * 1024

type ActivationRecordTarget = {
  conn: DolphindHostTransport
  host: RemoteHostPlatform
  remoteHome: string
  signal?: AbortSignal
}

export function dolphindActivationPath(host: RemoteHostPlatform, remoteHome: string): string {
  return joinRemotePath(host, remoteHome, RELAY_REMOTE_DIR, DOLPHIND_ACTIVATION_FILENAME)
}

async function readActivationRecordState(
  options: ActivationRecordTarget
): Promise<DolphindActivationReadResult> {
  const read = await readBoundedDolphindRemoteRecord(
    options,
    dolphindActivationPath(options.host, options.remoteHome),
    DOLPHIND_ACTIVATION_RECORD_MAX_BYTES
  )
  return read.state === 'absent' ? read : parseDolphindActivationRecord(read.raw)
}

export async function readDolphindActivationRecord(
  options: ActivationRecordTarget
): Promise<DolphindActivationRecord> {
  const parsed = await readActivationRecordState(options)
  if (parsed.state === 'ok') {
    return parsed.record
  }
  if (parsed.state === 'unreadable') {
    throw new Error(`Cannot read this host's dolphind activation record: ${parsed.reason}`)
  }
  return emptyDolphindActivationRecord()
}

/** Refuse replacement of unreadable records, including schemas written by newer clients. */
export async function writeDolphindActivationRecord(
  options: ActivationRecordTarget,
  record: DolphindActivationRecord
): Promise<void> {
  const existing = await readActivationRecordState(options)
  if (existing.state === 'unreadable') {
    throw new Error(
      `Refusing to overwrite this host's dolphind activation record: ${existing.reason}`
    )
  }
  await writeAtomicDolphindRemoteRecord(
    options,
    dolphindActivationPath(options.host, options.remoteHome),
    serializeDolphindActivationRecord(record)
  )
}
