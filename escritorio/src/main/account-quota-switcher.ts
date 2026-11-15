import type {
  AccountQuotaSwitchNotice,
  ProviderRateLimits,
  RateLimitState
} from '../shared/rate-limit-types'

export type QuotaProvider = 'claude' | 'codex'

export type QuotaAccount = {
  id: string
  label: string | null
}

export type QuotaSelectionResult =
  | { kind: 'keep'; account: QuotaAccount }
  | { kind: 'switch'; from: QuotaAccount; to: QuotaAccount }
  | { kind: 'none'; from: QuotaAccount; resetsAt: number | null }

export type QuotaSelectionInput = {
  accounts: readonly QuotaAccount[]
  currentAccountId: string
  currentAccount: QuotaAccount
  usageByAccount: ReadonlyMap<string, ProviderRateLimits | null>
  currentIsOutOfQuota?: boolean
  currentResetAt?: number | null
}

export function accountIsOutOfQuota(rateLimits: ProviderRateLimits | null): boolean {
  if (!rateLimits) {
    return false
  }
  return [rateLimits.session, rateLimits.weekly, rateLimits.fableWeekly]
    .filter((window): window is NonNullable<typeof window> => window != null)
    .some((window) => window.usedPercent >= 100)
}

export function accountResetAt(rateLimits: ProviderRateLimits | null): number | null {
  const resets = [rateLimits?.session, rateLimits?.weekly, rateLimits?.fableWeekly]
    .map((window) => window?.resetsAt)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return resets.length > 0 ? Math.max(...resets) : null
}

export function chooseQuotaAccount(input: QuotaSelectionInput): QuotaSelectionResult {
  const currentUsage = input.usageByAccount.get(input.currentAccountId) ?? null
  if (!input.currentIsOutOfQuota && !accountIsOutOfQuota(currentUsage)) {
    return { kind: 'keep', account: input.currentAccount }
  }

  const currentIndex = input.accounts.findIndex((account) => account.id === input.currentAccountId)
  const candidates = input.accounts
    .map((account, index) => ({ account, index }))
    .filter(({ account }) => account.id !== input.currentAccountId)
    .sort(({ index: a }, { index: b }) => {
      const distance =
        currentIndex === -1 ? a : (a - currentIndex + input.accounts.length) % input.accounts.length
      const otherDistance =
        currentIndex === -1 ? b : (b - currentIndex + input.accounts.length) % input.accounts.length
      return distance - otherDistance
    })
  const next = candidates.find(({ account }) => {
    const usage = input.usageByAccount.get(account.id)
    return usage != null && !accountIsOutOfQuota(usage)
  })
  if (next) {
    return { kind: 'switch', from: input.currentAccount, to: next.account }
  }
  return {
    kind: 'none',
    from: input.currentAccount,
    resetsAt: Math.max(input.currentResetAt ?? 0, latestResetAt(input.usageByAccount) ?? 0) || null
  }
}

export function latestResetAt(
  usageByAccount: ReadonlyMap<string, ProviderRateLimits | null>
): number | null {
  const resets = [...usageByAccount.values()]
    .map(accountResetAt)
    .filter((value): value is number => value !== null)
  return resets.length > 0 ? Math.max(...resets) : null
}

export function createQuotaSwitchNotice(
  provider: QuotaProvider,
  result: Exclude<QuotaSelectionResult, { kind: 'keep' }>
): AccountQuotaSwitchNotice {
  const reset = result.kind === 'none' ? result.resetsAt : null
  const toId = result.kind === 'switch' ? result.to.id : 'none'
  const id = `${provider}:${result.kind}:${result.from.id}:${toId}:${reset ?? 'unknown'}`
  if (result.kind === 'switch') {
    return {
      id,
      provider,
      kind: result.kind,
      from: result.from,
      to: result.to,
      resetsAt: null
    }
  }
  return {
    id,
    provider,
    kind: result.kind,
    from: result.from,
    resetsAt: result.resetsAt
  }
}

export function usageByAccountFromState(
  state: RateLimitState,
  provider: QuotaProvider,
  currentAccountId: string,
  accounts: readonly { accountId: string; rateLimits: ProviderRateLimits | null }[]
): ReadonlyMap<string, ProviderRateLimits | null> {
  const usage = new Map(accounts.map((account) => [account.accountId, account.rateLimits]))
  if (currentAccountId) {
    usage.set(currentAccountId, state[provider])
  }
  return usage
}
