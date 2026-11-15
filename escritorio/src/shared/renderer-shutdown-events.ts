export const DOLPHIN_RENDERER_UNLOAD_PREVENTED_EVENT = 'dolphin:renderer-unload-prevented'
export const DOLPHIN_RENDERER_SHUTDOWN_CHECKPOINT_FAILED_EVENT =
  'dolphin:renderer-shutdown-checkpoint-failed'
export const DOLPHIN_RENDERER_SHUTDOWN_CHECKPOINT_ABORTED_EVENT =
  'dolphin:renderer-shutdown-checkpoint-aborted'

// DOM attributes carry failure details across renderer/preload worlds; event JS payloads cannot cross.
export const DOLPHIN_SHUTDOWN_CHECKPOINT_FAILURE_REASON_ATTRIBUTE =
  'data-dolphin-shutdown-checkpoint-failure'

export function formatShutdownCheckpointFailureReason(error: unknown): string {
  try {
    const reason = String(error instanceof Error ? error.message : error)
    return reason || 'Unknown shutdown checkpoint failure'
  } catch {
    return 'Unknown shutdown checkpoint failure'
  }
}

export function publishShutdownCheckpointFailureReason(reason: string): void {
  try {
    globalThis.document?.documentElement?.setAttribute(
      DOLPHIN_SHUTDOWN_CHECKPOINT_FAILURE_REASON_ATTRIBUTE,
      reason
    )
  } catch {
    // Best-effort diagnostics; the checkpoint verdict itself is carried by the event.
  }
}

export function clearShutdownCheckpointFailureReason(): void {
  try {
    globalThis.document?.documentElement?.removeAttribute(
      DOLPHIN_SHUTDOWN_CHECKPOINT_FAILURE_REASON_ATTRIBUTE
    )
  } catch {
    // Best-effort diagnostics only.
  }
}

/** Read and clear the published reason so a stale one can't label a later failure. */
export function consumeShutdownCheckpointFailureReason(): string | null {
  try {
    const root = globalThis.document?.documentElement
    const reason = root?.getAttribute(DOLPHIN_SHUTDOWN_CHECKPOINT_FAILURE_REASON_ATTRIBUTE)
    if (reason) {
      root?.removeAttribute(DOLPHIN_SHUTDOWN_CHECKPOINT_FAILURE_REASON_ATTRIBUTE)
    }
    return reason || null
  } catch {
    return null
  }
}
