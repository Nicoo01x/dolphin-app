import { ipcMain } from 'electron'
import type { ClaudeUsageStore } from '../claude-usage/store'
import type { CodexUsageStore } from '../codex-usage/store'
import type { OpenCodeUsageStore } from '../opencode-usage/store'
import type { MuseUsageStore } from '../muse-usage/store'
import { estimateCostUsd } from '../claude-usage/claude-model-pricing'
type ClaudeCostQuery = {
  model: string | null
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isClaudeCostQuery(value: unknown): value is ClaudeCostQuery {
  if (!isRecord(value)) {
    return false
  }
  if (value.model !== null && typeof value.model !== 'string') {
    return false
  }
  const tokens = value.tokens
  if (!isRecord(tokens)) {
    return false
  }
  return ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'].every(
    (key) => typeof tokens[key] === 'number' && Number.isFinite(tokens[key]) && tokens[key] >= 0
  )
}

type UsageProviderStores = {
  claudeUsage: ClaudeUsageStore
  codexUsage: CodexUsageStore
  openCodeUsage: OpenCodeUsageStore
  museUsage: MuseUsageStore
}

type UsageProviderChannelPrefix = keyof UsageProviderStores

type UsageProviderHandlerStore<Scope, Range, BreakdownKind> = {
  whenLoaded: () => Promise<void>
  getScanState: () => unknown
  setEnabled: (enabled: boolean) => unknown
  refresh: (force?: boolean) => unknown
  getSnapshot: (scope: Scope, range: Range, limit?: number) => unknown
  getSummary: (scope: Scope, range: Range) => unknown
  getDaily: (scope: Scope, range: Range) => unknown
  getBreakdown: (scope: Scope, range: Range, kind: BreakdownKind) => unknown
  getRecentSessions: (scope: Scope, range: Range, limit?: number) => unknown
}

type UsageRangeArgs<Scope, Range> = {
  scope: Scope
  range: Range
}

function registerProviderHandlers<Scope, Range, BreakdownKind>(
  prefix: UsageProviderChannelPrefix,
  usage: UsageProviderHandlerStore<Scope, Range, BreakdownKind>
): void {
  // Wait for worker hydration so getters cannot return persisted-state defaults.
  ipcMain.handle(`${prefix}:getScanState`, async () => {
    await usage.whenLoaded()
    return usage.getScanState()
  })
  ipcMain.handle(`${prefix}:setEnabled`, (_event, args: { enabled: boolean }) =>
    usage.setEnabled(args.enabled)
  )
  ipcMain.handle(`${prefix}:refresh`, (_event, args?: { force?: boolean }) =>
    usage.refresh(args?.force ?? false)
  )
  ipcMain.handle(
    `${prefix}:getSnapshot`,
    async (_event, args: UsageRangeArgs<Scope, Range> & { limit?: number }) => {
      await usage.whenLoaded()
      return usage.getSnapshot(args.scope, args.range, args.limit)
    }
  )
  ipcMain.handle(`${prefix}:getSummary`, (_event, args: UsageRangeArgs<Scope, Range>) =>
    usage.getSummary(args.scope, args.range)
  )
  ipcMain.handle(`${prefix}:getDaily`, (_event, args: UsageRangeArgs<Scope, Range>) =>
    usage.getDaily(args.scope, args.range)
  )
  ipcMain.handle(
    `${prefix}:getBreakdown`,
    (_event, args: UsageRangeArgs<Scope, Range> & { kind: BreakdownKind }) =>
      usage.getBreakdown(args.scope, args.range, args.kind)
  )
  ipcMain.handle(
    `${prefix}:getRecentSessions`,
    (_event, args: UsageRangeArgs<Scope, Range> & { limit?: number }) =>
      usage.getRecentSessions(args.scope, args.range, args.limit)
  )
}

export function registerUsageProviderHandlers(stores: UsageProviderStores): void {
  registerProviderHandlers('claudeUsage', stores.claudeUsage)
  registerProviderHandlers('codexUsage', stores.codexUsage)
  registerProviderHandlers('openCodeUsage', stores.openCodeUsage)
  registerProviderHandlers('museUsage', stores.museUsage)
  ipcMain.handle('claudeUsage:estimateCost', (_event, query: unknown) => {
    if (!isClaudeCostQuery(query)) {
      return null
    }
    // Why: the session usage decoder does not expose the 1-hour cache-write subset.
    return estimateCostUsd(query.model, { ...query.tokens, cacheWrite1hTokens: 0 })
  })
}
