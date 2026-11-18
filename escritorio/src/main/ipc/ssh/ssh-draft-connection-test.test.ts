import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { setConnectionManager } from './ssh-ipc-context'
import { testingTargets } from './ssh-connect-attempt-registry'
import { testSshDraftConnection } from './ssh-draft-connection-test'
import { markSshSessionStartFailure } from '../../ssh/connection/ssh-session-start-failure'
import type { SshConnectionManager } from '../../ssh/connection/ssh-connection-manager'

const DRAFT = { label: 'my-vps', host: '203.0.113.10', port: 22, username: 'root' }

function managerWith(connect: () => Promise<unknown>) {
  const manager = { connect: vi.fn(connect), disconnect: vi.fn(async () => {}) }
  setConnectionManager(manager as unknown as SshConnectionManager)
  return manager
}

afterEach(() => setConnectionManager(null))

describe('testing an SSH host before it is saved', () => {
  it('probes a throwaway target, closes it and publishes nothing for it', async () => {
    let probedId = ''
    const manager = managerWith(async () => {
      probedId = (manager.connect.mock.calls[0] as unknown as [{ id: string }])[0].id
      expect(testingTargets.has(probedId)).toBe(true)
      return {}
    })
    await expect(testSshDraftConnection(DRAFT)).resolves.toEqual({ success: true })
    expect(probedId).toMatch(/^draft-/)
    expect(manager.connect).toHaveBeenCalledWith(expect.objectContaining(DRAFT), { probe: true })
    expect(manager.disconnect).toHaveBeenCalledWith(probedId)
    expect(testingTargets.has(probedId)).toBe(false)
  })

  it('leads a failed sign-in with its next step and still closes the probe', async () => {
    const manager = managerWith(async () => {
      throw markSshSessionStartFailure(new Error('All configured authentication methods failed'))
    })
    const result = await testSshDraftConnection(DRAFT)
    expect(result).toMatchObject({ success: false })
    expect(result.success ? '' : result.error).toMatch(
      /^The host didn’t accept any sign-in .*\(All configured authentication methods failed\)$/
    )
    expect(manager.disconnect).toHaveBeenCalledTimes(1)
  })
})
