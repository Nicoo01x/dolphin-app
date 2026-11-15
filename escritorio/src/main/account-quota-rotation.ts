import type { Store } from './persistence/loading-store/store'
import type { RateLimitState } from '../shared/rate-limit-types'
import {
  accountIsOutOfQuota,
  accountResetAt,
  chooseQuotaAccount,
  createQuotaSwitchNotice,
  usageByAccountFromState,
  type QuotaProvider
} from './account-quota-switcher'
import {
  getClaudeSelectionTargetForAccount,
  getSelectedClaudeAccountIdForTarget
} from './claude-accounts/runtime-selection'
import {
  getCodexSelectionTargetForAccount,
  getSelectedCodexAccountIdForTarget
} from './codex-accounts/runtime-selection'
import type { ClaudeAccountService } from './claude-accounts/service'
import type { CodexAccountService } from './codex-accounts/service'
import type { RateLimitService } from './rate-limits/service/rate-limit-service'

const SYSTEM_ACCOUNT_ID = '__system-default__'

type QuotaRotationOptions = {
  store: Store
  rateLimits: RateLimitService
  claudeAccounts: ClaudeAccountService
  codexAccounts: CodexAccountService
}

export class AccountQuotaRotation {
  private readonly inFlight = new Set<QuotaProvider>()
  private readonly lastObservation = new Map<QuotaProvider, string>()

  constructor(private readonly options: QuotaRotationOptions) {
    options.rateLimits.onStateChange((state) => this.observeState(state))
  }

  notifyUsageLimit(provider: QuotaProvider, resetsAt?: number, sessionAccountId?: string): void {
    const state = this.options.rateLimits.getState()
    const accountId = this.currentAccountId(provider, state)
    if (sessionAccountId !== undefined && sessionAccountId !== accountId) {
      return
    }
    void this.rotate(provider, true, resetsAt, accountId)
  }

  private observeState(state: RateLimitState): void {
    for (const provider of ['claude', 'codex'] as const) {
      const limits = state[provider]
      if (!limits || !accountIsOutOfQuota(limits)) {
        continue
      }
      const currentId = this.currentAccountId(provider, state)
      const observation = `${currentId}:${accountResetAt(limits) ?? 'unknown'}`
      if (this.lastObservation.get(provider) === observation) {
        continue
      }
      this.lastObservation.set(provider, observation)
      void this.rotate(provider, false)
    }
  }

  private async rotate(
    provider: QuotaProvider,
    forced: boolean,
    forcedResetAt?: number,
    expectedAccountId?: string | null
  ): Promise<void> {
    if (this.inFlight.has(provider)) {
      return
    }
    this.inFlight.add(provider)
    try {
      const stateBeforeFetch = this.options.rateLimits.getState()
      const currentId = this.currentAccountId(provider, stateBeforeFetch)
      if (forced && currentId !== expectedAccountId) {
        return
      }
      const currentKey = currentId ?? SYSTEM_ACCOUNT_ID
      const currentAccount = this.currentAccount(provider, currentId)
      if (!forced && !accountIsOutOfQuota(stateBeforeFetch[provider])) {
        return
      }
      await this.fetchInactive(provider)
      const state = this.options.rateLimits.getState()
      const accounts = this.accountsForTarget(provider, state)
      const usage = usageByAccountFromState(
        state,
        provider,
        currentKey,
        provider === 'claude' ? state.inactiveClaudeAccounts : state.inactiveCodexAccounts
      )
      const result = chooseQuotaAccount({
        accounts,
        currentAccountId: currentKey,
        currentAccount,
        usageByAccount: usage,
        currentIsOutOfQuota: forced,
        currentResetAt: forcedResetAt ?? accountResetAt(state[provider])
      })
      if (result.kind === 'keep') {
        return
      }
      if (result.kind === 'switch') {
        await this.select(provider, result.to.id)
      }
      this.options.rateLimits.publishAccountSwitchNotice(createQuotaSwitchNotice(provider, result))
    } catch (error) {
      console.warn(`[account-quota] No se pudo cambiar la cuenta de ${provider}:`, error)
    } finally {
      this.inFlight.delete(provider)
    }
  }

  private currentAccountId(provider: QuotaProvider, state: RateLimitState): string | null {
    const settings = this.options.store.getSettings()
    return provider === 'claude'
      ? getSelectedClaudeAccountIdForTarget(settings, state.claudeTarget)
      : getSelectedCodexAccountIdForTarget(settings, state.codexTarget)
  }

  private currentAccount(provider: QuotaProvider, id: string | null) {
    const settings = this.options.store.getSettings()
    const account =
      id == null
        ? null
        : provider === 'claude'
          ? settings.claudeManagedAccounts.find((entry) => entry.id === id)
          : settings.codexManagedAccounts.find((entry) => entry.id === id)
    return { id: id ?? SYSTEM_ACCOUNT_ID, label: account?.email ?? null }
  }

  private accountsForTarget(provider: QuotaProvider, state: RateLimitState) {
    const settings = this.options.store.getSettings()
    const target = provider === 'claude' ? state.claudeTarget : state.codexTarget
    // Claude says where an account runs in managedAuthRuntime; Codex, in managedHomeRuntime.
    const accounts =
      provider === 'claude'
        ? settings.claudeManagedAccounts.map((account) => ({
            account,
            runtime: account.managedAuthRuntime
          }))
        : settings.codexManagedAccounts.map((account) => ({
            account,
            runtime: account.managedHomeRuntime
          }))
    return accounts
      .filter(({ runtime }) => (runtime ?? 'host') === target.runtime)
      .filter(
        ({ account }) =>
          target.runtime !== 'wsl' || (account.wslDistro ?? null) === target.wslDistro
      )
      .map(({ account }) => ({ id: account.id, label: account.email }))
  }

  private fetchInactive(provider: QuotaProvider): Promise<unknown> {
    return provider === 'claude'
      ? this.options.rateLimits.fetchInactiveClaudeAccountsOnOpen()
      : this.options.rateLimits.fetchInactiveCodexAccountsOnOpen()
  }

  private select(provider: QuotaProvider, accountId: string): Promise<unknown> {
    const settings = this.options.store.getSettings()
    if (provider === 'claude') {
      const account = settings.claudeManagedAccounts.find((entry) => entry.id === accountId)
      return this.options.claudeAccounts.selectAccountForTarget(
        accountId,
        account ? getClaudeSelectionTargetForAccount(account) : undefined
      )
    }
    const account = settings.codexManagedAccounts.find((entry) => entry.id === accountId)
    return this.options.codexAccounts.selectAccountForTarget(
      accountId,
      account ? getCodexSelectionTargetForAccount(account) : undefined
    )
  }
}
