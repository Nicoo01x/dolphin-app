/**
 * Whether the start composer can start anything yet, and if not, what is missing.
 *
 * Kept apart from the surface because "why is the button off" is the whole value of this
 * screen: a disabled arrow with no reason is the bug this file exists to prevent. The order of
 * the checks is the order a person hits them, so the hint always names the next thing to do
 * rather than the last one that failed.
 */
export type StartGate =
  | { kind: 'ready' }
  | {
      kind: 'blocked'
      reason:
        | 'creating'
        | 'no-projects'
        | 'no-project-selected'
        | 'empty-prompt'
        | 'reading-agents'
        | 'project-not-ready'
    }

export type StartGateInput = {
  projectCount: number
  selectedProjectId: string | null
  prompt: string
  creating: boolean
  /** False while the agent inventory of the target host is still being read. */
  launchReady: boolean
  /** The composer's own verdict: a project that still needs a location or a connection. */
  formDisabled: boolean
}

export function resolveStartGate(input: StartGateInput): StartGate {
  if (input.creating) {
    return { kind: 'blocked', reason: 'creating' }
  }
  if (input.projectCount === 0) {
    return { kind: 'blocked', reason: 'no-projects' }
  }
  if (!input.selectedProjectId) {
    return { kind: 'blocked', reason: 'no-project-selected' }
  }
  if (!input.prompt.trim()) {
    return { kind: 'blocked', reason: 'empty-prompt' }
  }
  // Checked after the prompt on purpose: both are usually pending at once on a cold start, and
  // "write what you want" is the useful half to say while detection finishes on its own.
  if (!input.launchReady) {
    return { kind: 'blocked', reason: 'reading-agents' }
  }
  if (input.formDisabled) {
    return { kind: 'blocked', reason: 'project-not-ready' }
  }
  return { kind: 'ready' }
}

/** True while the only thing missing is something the app is doing by itself. */
export function startGateIsWaiting(gate: StartGate): boolean {
  return gate.kind === 'blocked' && (gate.reason === 'creating' || gate.reason === 'reading-agents')
}
