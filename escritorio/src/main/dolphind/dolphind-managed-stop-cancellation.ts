import { rmSync } from 'node:fs'
import type {
  DolphindManagedStopCancellation,
  DolphindManagedStopRequest
} from '../../shared/dolphind-stop-request'
import { claimDolphindManagedStopDecision } from './dolphind-managed-stop-decision'
import {
  dolphindManagedStopRequestPath,
  readDolphindManagedStopRequest
} from './dolphind-managed-stop-request'

/** Dispatched stops cannot be canceled; their completion verdict remains authoritative. */
export function cancelDolphindManagedStop(
  request: DolphindManagedStopRequest
): DolphindManagedStopCancellation['outcome'] {
  const outcome = claimDolphindManagedStopDecision(request, 'canceled')
  if (outcome === 'canceled') {
    withdrawDolphindManagedStopRequest(request)
  }
  return outcome
}

export function withdrawDolphindManagedStopRequest(request: DolphindManagedStopRequest): void {
  const path = dolphindManagedStopRequestPath(request.instance)
  try {
    if (readDolphindManagedStopRequest(path).transactionId === request.transactionId) {
      rmSync(path, { force: true })
    }
  } catch {
    // The persisted decision fences this transaction even if its request is gone.
  }
}
