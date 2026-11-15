import { describe, expect, it } from 'vitest'
import {
  getLegacyManagedDolphindOwnerEnvironmentId,
  getManagedDolphindFenceEnvironmentId,
  isEphemeralRuntimeSshOwner
} from './managed-dolphind-ssh-owner'

describe('managed dolphind SSH fence', () => {
  it('reads the fence from dolphindFence, never from owner', () => {
    expect(getManagedDolphindFenceEnvironmentId({ dolphindFence: { environmentId: 'env-1' } })).toBe(
      'env-1'
    )
    const legacyOnly = {
      dolphindFence: undefined,
      owner: { type: 'on-demand-runtime' as const, runtimeId: 'managed-dolphind:old' }
    }
    expect(getManagedDolphindFenceEnvironmentId({ ...legacyOnly })).toBeNull()
    expect(
      getManagedDolphindFenceEnvironmentId({ ...legacyOnly, dolphindFence: { environmentId: 'env-2' } })
    ).toBe('env-2')
    expect(getManagedDolphindFenceEnvironmentId(undefined)).toBeNull()
  })

  it('recognises the legacy owner fence only so loading can migrate it', () => {
    const legacy = { type: 'on-demand-runtime' as const, runtimeId: 'managed-orcad:env-1' }
    expect(getLegacyManagedDolphindOwnerEnvironmentId(legacy)).toBe('env-1')
    expect(isEphemeralRuntimeSshOwner(legacy)).toBe(false)
  })

  it('keeps ordinary on-demand runtime targets ephemeral', () => {
    const owner = { type: 'on-demand-runtime' as const, runtimeId: 'runtime-1' }
    expect(getLegacyManagedDolphindOwnerEnvironmentId(owner)).toBeNull()
    expect(isEphemeralRuntimeSshOwner(owner)).toBe(true)
  })
})
