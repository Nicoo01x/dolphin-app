import { DOLPHIN_LAYOUT_OWNER_IS_MAIN } from '../../shared/layout-owner-switch'
import type { DolphinRuntimeService } from '../runtime/dolphin-runtime'
import type { DolphindFeatureReadiness } from '../runtime/rpc/dolphind-feature-readiness'
import { placeUnshownLiveTerminalsBestEffort } from '../runtime/terminal/adoption/unshown-live-terminal-placement'
import type { createDolphindStartupTiming } from './dolphind-startup-timing'

/** Restored orchestration authority, the legacy terminal reconcile and unshown placement, in order. */
export async function restoreDolphindTerminalAuthority(
  runtime: DolphinRuntimeService,
  timed: ReturnType<typeof createDolphindStartupTiming>['time'],
  readiness: DolphindFeatureReadiness
): Promise<void> {
  await timed('orchestration', () => runtime.refreshRestoredOrchestrationAuthority())
  readiness.open('orchestration')
  // Terminal inventory stays on the critical path: no latch, every client needs it at connect.
  await timed('reconcile-terminals', () => runtime.reconcileLegacyWorkerTerminals())
  if (DOLPHIN_LAYOUT_OWNER_IS_MAIN) {
    await placeUnshownLiveTerminalsBestEffort(runtime)
  }
  readiness.open('unshownPlacement')
}
