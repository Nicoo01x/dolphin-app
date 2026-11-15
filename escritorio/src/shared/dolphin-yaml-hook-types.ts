export type SetupRunPolicy = 'ask' | 'run-by-default' | 'skip-by-default'
export type SetupAgentStartupPolicy = 'start-immediately' | 'wait-for-setup'
export type HookCommandSourcePolicy = 'shared-only' | 'local-only' | 'run-both'

export type DolphinHooks = {
  scripts: {
    setup?: string // Runs after worktree is created
    archive?: string // Runs before worktree is archived
  }
  setupAgentStartupPolicy?: SetupAgentStartupPolicy
  issueCommand?: string // Shared default command for linked GitHub issues
  defaultTabs?: DolphinDefaultTabTemplate[] // Terminal tabs to create once for a new worktree
  environmentRecipes?: DolphinVmRecipe[] // Project-scoped per-workspace environment recipes
  environmentRecipeDiagnostics?: DolphinVmRecipeDiagnostic[] // Non-fatal validation issues from environmentRecipes
  worktree?: DolphinWorktreeDefaults // Project-scoped defaults applied when a worktree is created
}

export type DolphinWorktreeDefaults = {
  // Share large rebuildable directories such as node_modules across worktrees instead of copying installs.
  sharedDirectories?: string[]
}

export type DolphinDefaultTabTemplate = {
  title?: string
  color?: string
  command?: string
}

export type EphemeralVmCheckoutMode = 'dolphin-worktree' | 'provisioned-root'

export type DolphinVmRecipe = {
  id: string
  name: string
  create: string
  checkoutMode?: EphemeralVmCheckoutMode
  description?: string
  suspend?: string
  resume?: string
  destroy?: string
  destroyDisabled?: boolean
  // Per-mode wall-clock limits; dolphin.yaml accepts one number for every mode or a per-mode map.
  timeoutSeconds?: DolphinVmRecipeTimeoutSeconds
  // Opt-in allowlist of Dolphin's environment variables the scripts receive (plus a safe base set).
  // Omitted means scripts inherit the full environment.
  passEnv?: string[]
}

export type DolphinVmRecipeLifecycleMode = 'create' | 'suspend' | 'resume' | 'destroy'

export type DolphinVmRecipeTimeoutSeconds = Partial<Record<DolphinVmRecipeLifecycleMode, number>>

export type DolphinVmRecipeDiagnostic = {
  index: number
  field?: string
  message: string
}

export type RepoHookSettings = {
  // Retain the old hook-UI mode so persisted state reads without migration.
  mode: 'auto' | 'override'
  setupRunPolicy?: SetupRunPolicy
  setupAgentStartupPolicy?: SetupAgentStartupPolicy
  commandSourcePolicy?: HookCommandSourcePolicy
  scripts: {
    setup: string
    archive: string
  }
}

export type PersistedTrustedDolphinHookEntry = {
  contentHash: string
  approvedAt: number
  /** Earlier approvals, newest first, so switching between branches' scripts doesn't re-prompt. */
  previousContentHashes?: string[]
}

export type PersistedTrustedDolphinHookRepo = {
  all?: {
    approvedAt: number
  }
  setup?: PersistedTrustedDolphinHookEntry
  archive?: PersistedTrustedDolphinHookEntry
  issueCommand?: PersistedTrustedDolphinHookEntry
  vmRecipe?: PersistedTrustedDolphinHookEntry
}

export type PersistedTrustedDolphinHooks = Record<string, PersistedTrustedDolphinHookRepo>
