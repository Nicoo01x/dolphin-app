import { DolphindWindowsLaunchFailedError } from '../install/dolphind-remote-launch-windows'
import { DolphindLaunchReadinessError } from './dolphind-active-readiness'

/** A launch that ended a run: it never became ready, or the host reported it could not start. */
export function isDolphindLaunchFailure(error: unknown): error is Error {
  return (
    error instanceof DolphindLaunchReadinessError || error instanceof DolphindWindowsLaunchFailedError
  )
}

/** Only a readiness failure had a running dolphind, whose death the next dolphind will report. */
export function dolphindLaunchFailureRanProcess(error: Error): boolean {
  return error instanceof DolphindLaunchReadinessError
}
