import { describe, expect, it, vi } from 'vitest'
import { chooseQuotaAccount, createQuotaSwitchNotice } from './account-quota-switcher'
import type { ProviderRateLimits } from '../shared/rate-limit-types'

const account = (id: string, label = id) => ({ id, label })
const limits = (usedPercent: number, resetsAt: number | null = null): ProviderRateLimits => ({
  provider: 'claude',
  session: { usedPercent, resetsAt, windowMinutes: 300, resetDescription: null },
  weekly: null,
  updatedAt: 1,
  error: null,
  status: 'ok'
})

describe('chooseQuotaAccount', () => {
  it('elige la siguiente cuenta cuando la actual llegó al límite', () => {
    const result = chooseQuotaAccount({
      accounts: [account('a', 'ana@example.com'), account('b', 'beto@example.com')],
      currentAccountId: 'a',
      currentAccount: account('a', 'ana@example.com'),
      usageByAccount: new Map([
        ['a', limits(100, 10_000)],
        ['b', limits(40)]
      ])
    })

    expect(result).toEqual({
      kind: 'switch',
      from: account('a', 'ana@example.com'),
      to: account('b', 'beto@example.com')
    })
  })

  it('con tres o más, pasa a la siguiente en el orden después de la actual, salteando las agotadas', () => {
    const result = chooseQuotaAccount({
      accounts: [account('a'), account('b'), account('c'), account('d')],
      currentAccountId: 'b',
      currentAccount: account('b'),
      usageByAccount: new Map([
        ['a', limits(10)],
        ['b', limits(100)],
        ['c', limits(100)],
        ['d', limits(20)]
      ])
    })

    expect(result).toEqual({ kind: 'switch', from: account('b'), to: account('d') })
  })

  it('informa cuándo vuelve el cupo si todas están agotadas', () => {
    const result = chooseQuotaAccount({
      accounts: [account('a', 'ana@example.com'), account('b', 'beto@example.com')],
      currentAccountId: 'a',
      currentAccount: account('a', 'ana@example.com'),
      usageByAccount: new Map([
        ['a', limits(100, 10 * 24 * 60 * 60 * 1000)],
        ['b', limits(100, 20 * 24 * 60 * 60 * 1000)]
      ])
    })

    expect(result).toMatchObject({ kind: 'none', resetsAt: 20 * 24 * 60 * 60 * 1000 })
    if (result.kind === 'keep') {
      throw new Error('esperaba que no quedara ninguna cuenta con cupo')
    }
    const notice = createQuotaSwitchNotice('claude', result)
    expect(notice).toMatchObject({
      kind: 'none',
      from: { id: 'a', label: 'ana@example.com' },
      resetsAt: 20 * 24 * 60 * 60 * 1000
    })
    expect(createQuotaSwitchNotice('claude', result).id).toBe(notice.id)
  })

  it('mantiene estable el aviso aunque cambie la hora de consulta', () => {
    const result = {
      kind: 'none' as const,
      from: account('a', 'ana@example.com'),
      resetsAt: 20 * 24 * 60 * 60 * 1000
    }
    vi.useFakeTimers()
    try {
      const first = createQuotaSwitchNotice('claude', result)
      vi.setSystemTime(new Date(60_000))
      expect(createQuotaSwitchNotice('claude', result).id).toBe(first.id)
    } finally {
      vi.useRealTimers()
    }
  })

  it('mantiene la cuenta elegida a mano mientras tenga cupo', () => {
    const result = chooseQuotaAccount({
      accounts: [account('a'), account('b')],
      currentAccountId: 'b',
      currentAccount: account('b'),
      usageByAccount: new Map([
        ['a', limits(10)],
        ['b', limits(80)]
      ])
    })

    expect(result).toEqual({ kind: 'keep', account: account('b') })
  })
})
