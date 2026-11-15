// Set synchronously once the host commits to shutting down (Electron will-quit, dolphind shutdown admission).
let hostShuttingDown = false

export function markHostShuttingDown(): void {
  hostShuttingDown = true
}

export function isHostShuttingDown(): boolean {
  return hostShuttingDown
}
