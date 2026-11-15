// Consume clean idle-stop evidence once; discard failed stops so later crashes cannot inherit it.
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { readNodeFileSyncWithinLimit } from '../../shared/file-content/node-bounded-file-reader'
import { writeDurableSecureJsonFile } from '../../shared/secure-storage/secure-file'
import {
  DOLPHIND_IDLE_STOP_RECORD_FILENAME,
  DolphindIdleStopRecordSchema,
  type DolphindIdleStopRecord
} from '../../shared/dolphind-idle-exit'
import type { DolphindIdleExitEvidence } from './dolphind-idle-exit-monitor'
import { hasErrorCode } from '../daemon/endpoint/identity/daemon-process-inspection'

const RECORD_MAX_BYTES = 16 * 1024

export function dolphindIdleStopRecordPath(userDataPath: string): string {
  return join(userDataPath, DOLPHIND_IDLE_STOP_RECORD_FILENAME)
}

export function writeDolphindIdleStopRecord(
  userDataPath: string,
  evidence: DolphindIdleExitEvidence,
  version: string
): void {
  const record: DolphindIdleStopRecord = {
    schemaVersion: 1,
    kind: 'dolphind_idle_stop',
    pid: process.pid,
    version,
    quietSince: new Date(evidence.quietSince).toISOString(),
    stoppedAt: new Date(evidence.stoppedAt).toISOString(),
    idleTimeoutMs: evidence.timeoutMs
  }
  if (!writeDurableSecureJsonFile(dolphindIdleStopRecordPath(userDataPath), record)) {
    throw new Error('dolphind_idle_stop_record_permissions_unconfirmed')
  }
}

export function consumeDolphindIdleStopRecord(userDataPath: string): DolphindIdleStopRecord | null {
  const path = dolphindIdleStopRecordPath(userDataPath)
  let record: DolphindIdleStopRecord | null = null
  try {
    const raw = readNodeFileSyncWithinLimit(path, RECORD_MAX_BYTES).buffer.toString('utf8')
    record = DolphindIdleStopRecordSchema.parse(JSON.parse(raw))
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return null
    }
    console.error('[dolphind] ignoring an unreadable idle-stop record:', error)
  }
  rmSync(path, { force: true })
  return record
}

export function discardDolphindIdleStopRecord(userDataPath: string): void {
  rmSync(dolphindIdleStopRecordPath(userDataPath), { force: true })
}
