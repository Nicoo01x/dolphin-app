import { describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), toastMocks)
}))

import { loadSshConfigHostsForPicker, saveNewSshHostFromForm } from './add-remote-host-ssh-actions'
import { EMPTY_FORM } from '../../../ssh-host-form/ssh-target-draft'

describe('SSH config picker response admission', () => {
  it('accepts the legacy preload array without exposing an unbounded row list', async () => {
    const hosts = Array.from({ length: 150 }, (_, index) => ({
      alias: `host-${index}`,
      hostname: `host-${index}`,
      port: 22,
      username: '',
      alreadyInDolphin: index === 0
    }))
    const result = await loadSshConfigHostsForPicker({
      listConfigHosts: vi.fn().mockResolvedValue(hosts)
    } as never)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result).toMatchObject({
        totalHostCount: 150,
        newHostCount: 149,
        matchCount: 150,
        hasMore: true
      })
      expect(result.result.hosts).toHaveLength(100)
    }
  })
})

describe('saving a new SSH host from the form', () => {
  const form = { ...EMPTY_FORM, label: 'my-vps', host: '203.0.113.10', username: 'root' }
  const deps = () => ({
    recordSshRepoReadoptions: vi.fn(),
    setSshTargetsMetadata: vi.fn(),
    recordFeatureInteraction: vi.fn()
  })

  it('tries the host first and keeps a failed test on the form without saving', async () => {
    const ssh = { listTargets: vi.fn().mockResolvedValue([]), addTarget: vi.fn() }
    const onFailed = vi.fn()
    const outcome = await saveNewSshHostFromForm({
      form,
      ssh,
      ...deps(),
      testFirst: {
        run: vi
          .fn()
          .mockResolvedValue({ success: false, error: 'connect ECONNREFUSED 203.0.113.10:22' }),
        onFailed
      }
    })
    expect(outcome).toBe('test-failed')
    expect(ssh.addTarget).not.toHaveBeenCalled()
    expect(onFailed.mock.calls[0]?.[0]).toContain('Check the host name and port')
    expect(toastMocks.error).not.toHaveBeenCalled()
  })

  it('saves once the test passes, and without one for "Save anyway"', async () => {
    for (const testFirst of [
      { run: vi.fn().mockResolvedValue({ success: true }), onFailed: vi.fn() },
      undefined
    ]) {
      const ssh = {
        listTargets: vi.fn().mockResolvedValue([]),
        addTarget: vi.fn().mockResolvedValue({ repoReadoptions: [] })
      }
      const outcome = await saveNewSshHostFromForm({
        form,
        ssh,
        ...deps(),
        ...(testFirst ? { testFirst } : {})
      })
      expect(outcome).toBe('saved')
      expect(ssh.addTarget).toHaveBeenCalledTimes(1)
    }
  })
})
