// Exclusive hard links arbitrate stop versus cancel; cancel cannot succeed once dispatch wins.
import { linkSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { writeDurableSecureJsonFile } from '../../shared/secure-storage/secure-file'
import {
  DolphindManagedStopDecisionSchema,
  DolphindManagedStopRequestSchema,
  type DolphindManagedStopDecision,
  type DolphindManagedStopRequest
} from '../../shared/dolphind-stop-request'
import { dolphindStopReceiptPath, readDolphindStopReceipt } from './dolphind-completed-stop-receipt'
import { hasErrorCode } from '../daemon/endpoint/identity/daemon-process-inspection'

type DolphindManagedStopDecisionValue = DolphindManagedStopDecision['decision']

export function readDolphindManagedStopDecision(
  request: DolphindManagedStopRequest
): DolphindManagedStopDecisionValue | null {
  return (
    readDolphindStopReceipt(request, 'decision', DolphindManagedStopDecisionSchema)?.decision ??
    null
  )
}

export function claimDolphindManagedStopDecision(
  input: DolphindManagedStopRequest,
  decision: DolphindManagedStopDecisionValue
): DolphindManagedStopDecisionValue {
  const request = DolphindManagedStopRequestSchema.parse(input)
  const path = dolphindStopReceiptPath(request, 'decision')
  const staged = `${path}.${process.pid}.${randomUUID()}.staged`
  const record: DolphindManagedStopDecision = {
    schemaVersion: 1,
    kind: 'dolphind_managed_stop_decision',
    request,
    decision
  }
  if (!writeDurableSecureJsonFile(staged, record)) {
    rmSync(staged, { force: true })
    throw new Error('dolphind_managed_stop_decision_permissions_unconfirmed')
  }
  try {
    linkSync(staged, path)
    return decision
  } catch (error) {
    if (!hasErrorCode(error, 'EEXIST')) {
      throw error
    }
    const standing = readDolphindManagedStopDecision(request)
    if (!standing) {
      throw new Error('dolphind_managed_stop_decision_unverifiable')
    }
    return standing
  } finally {
    rmSync(staged, { force: true })
  }
}
