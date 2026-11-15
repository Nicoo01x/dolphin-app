import { DOLPHIN_AGENT_SESSION_ID_ENV } from '../../../../shared/agent-session/lifecycle/agent-session-caller-env'
import { DOLPHIN_STRUCTURED_SESSION_ENV } from '../../../../shared/structured-session-marker'
import {
  DOLPHIN_SCRUB_SAFE_LAUNCH_ENV,
  DOLPHIN_SCRUB_SAFE_PANE_ENV
} from '../../../../shared/agent-hook-listener/transport/agent-hook-scrub-safe-env'

export const AGENT_HOOK_RUNTIME_ENV_KEYS = [
  'DOLPHIN_AGENT_HOOK_PORT',
  'DOLPHIN_AGENT_HOOK_TOKEN',
  'DOLPHIN_AGENT_HOOK_ENV',
  'DOLPHIN_AGENT_HOOK_VERSION',
  'DOLPHIN_AGENT_HOOK_TRANSPORT',
  'DOLPHIN_AGENT_HOOK_ENDPOINT',
  // Remove the reverted inherited path still present in older PTYs (#2778).
  'DOLPHIN_CLAUDE_AGENT_STATUS_SETTINGS'
] as const

export const AGENT_PANE_HOOK_ENV_KEYS = [
  'DOLPHIN_PANE_KEY',
  'DOLPHIN_TAB_ID',
  'DOLPHIN_WORKTREE_ID',
  'DOLPHIN_AGENT_LAUNCH_TOKEN',
  DOLPHIN_SCRUB_SAFE_PANE_ENV,
  DOLPHIN_SCRUB_SAFE_LAUNCH_ENV,
  ...AGENT_HOOK_RUNTIME_ENV_KEYS
] as const

// Inherited structured-session IDs would make every pane claim the parent orchestration caller.
export const DOLPHIN_AGENT_SESSION_CALLER_ENV_KEYS = [
  DOLPHIN_AGENT_SESSION_ID_ENV,
  DOLPHIN_STRUCTURED_SESSION_ENV
] as const
