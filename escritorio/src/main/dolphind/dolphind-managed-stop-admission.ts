import type { DolphindManagedStopRequest } from '../../shared/dolphind-stop-request'
import { persistDolphindDaemonRetirementRecord } from './dolphind-completed-stop-receipt'
import type { DolphindDaemonRetirement } from './dolphind-daemon-retirement'
import { stopDolphindAutomationScheduler } from './dolphind-automations'
import { holdDolphindTerminalAdmissionUntilExit } from './dolphind-stop-terminal-admission'

// Keep daemon imports lazy so entry loading cannot initialize native code.
async function retireLazily(): Promise<DolphindDaemonRetirement> {
  const { retireDolphindDaemonIfIdle } = await import('./dolphind-daemon-retirement')
  return retireDolphindDaemonIfIdle()
}

/** Record managed-stop outcomes without vetoing the stop. */
export async function prepareDolphindManagedStop(
  request: DolphindManagedStopRequest,
  retire: () => Promise<DolphindDaemonRetirement> = retireLazily,
  stopAutomations: () => void = stopDolphindAutomationScheduler,
  holdTerminalAdmission: () => void = holdDolphindTerminalAdmissionUntilExit
): Promise<void> {
  // Fence spawns before potentially slow daemon retirement.
  holdTerminalAdmission()
  // Stop dispatch before census so new runs cannot race shutdown.
  stopAutomations()
  if (!request.retireIdleDaemon) {
    return
  }
  const outcome = await retire().catch((error: unknown): DolphindDaemonRetirement => ({
    retirement: 'unverifiable',
    liveSessions: null,
    reason: `Retirement failed: ${error instanceof Error ? error.message : String(error)}`
  }))
  try {
    persistDolphindDaemonRetirementRecord(request, outcome)
  } catch (error) {
    // Missing retirement records remain unverifiable to the completion reader.
    console.error('[dolphind] could not record daemon retirement:', error)
  }
}
