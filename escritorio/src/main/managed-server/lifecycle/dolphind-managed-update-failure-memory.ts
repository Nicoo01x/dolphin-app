// Remember failures only for this session so restarting retries once.
export type DolphindUpdateFailureHost = { kind: 'ssh' | 'wsl'; id: string }

export type DolphindUpdateFailure = { code: string; reason: string }

const failedThisLaunch = new Map<string, DolphindUpdateFailure>()

function key(host: DolphindUpdateFailureHost): string {
  return `${host.kind}:${host.id}`
}

export function recordDolphindUpdateFailedThisLaunch(
  host: DolphindUpdateFailureHost,
  failure: DolphindUpdateFailure
): void {
  failedThisLaunch.set(key(host), failure)
}

export function dolphindUpdateFailureThisLaunch(
  host: DolphindUpdateFailureHost
): DolphindUpdateFailure | null {
  return failedThisLaunch.get(key(host)) ?? null
}

export function dolphindUpdateFailedThisLaunch(host: DolphindUpdateFailureHost): boolean {
  return failedThisLaunch.has(key(host))
}

export function clearDolphindUpdateFailedThisLaunch(host: DolphindUpdateFailureHost): void {
  failedThisLaunch.delete(key(host))
}

export function resetDolphindUpdateFailuresForTests(): void {
  failedThisLaunch.clear()
}
