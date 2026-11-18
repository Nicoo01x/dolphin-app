import { describe, expect, it } from 'vitest'
import { summarizeSshConnectionFailure } from './ssh-connection-failure-summary'
import {
  forgetLastSshConnectFailure,
  getLastSshConnectFailure,
  noteSshConnectErrorForLastFailure,
  noteSshStateForLastFailure
} from './ssh-last-connect-failure'

const RAW_AUTH = 'root@203.0.113.10: Permission denied (publickey).'

describe('summarizeSshConnectionFailure', () => {
  it('names an SSH failure by kind and never repeats SSH’s raw words', () => {
    const failure = summarizeSshConnectionFailure({ status: 'auth-failed', error: RAW_AUTH })
    expect(failure?.reason).toBe('auth')
    expect(failure?.nextStep).not.toContain('203.0.113.10')
    expect(failure?.nextStep).not.toContain('root@')
  })

  it('reports the server’s reason when SSH worked and the server did not', () => {
    const failure = summarizeSshConnectionFailure({
      status: 'error',
      error: 'whatever',
      managedServer: {
        kind: 'relay',
        reason: 'dolphind_unavailable',
        detail: 'artifacts_unavailable'
      }
    })
    expect(failure?.reason).toBe('server:unavailable:artifacts_unavailable')
    expect(failure?.nextStep).toContain('Update Dolphin')
    expect(failure?.nextStep).not.toContain('older version')
  })

  it('names a stopped setup by its remedy and a Node download by its own code', () => {
    expect(
      summarizeSshConnectionFailure({
        status: 'error',
        error: null,
        managedServer: {
          kind: 'relay',
          reason: 'failed',
          code: 'dolphind_snapshot_space_insufficient'
        }
      })?.reason
    ).toBe('server:setup-free-host-space')
    expect(
      summarizeSshConnectionFailure({
        status: 'error',
        error: null,
        managedServer: { kind: 'relay', reason: 'failed', nodeDownloadBlocked: { mirror: 'unset' } }
      })?.reason
    ).toBe('server:node-download-blocked')
  })

  it('says nothing failed for a connected host, and unknown for an error it can’t read', () => {
    expect(summarizeSshConnectionFailure({ status: 'connected', error: null })).toBeNull()
    expect(summarizeSshConnectionFailure({ status: 'error', error: 'odd' })?.reason).toBe('unknown')
  })
})

describe('the last failure a host published', () => {
  it('is kept after the failed session is gone and cleared once the host connects', () => {
    const targetId = 'ssh-summary-test'
    forgetLastSshConnectFailure(targetId)
    noteSshStateForLastFailure(targetId, {
      targetId,
      status: 'error',
      error: 'connect ETIMEDOUT 203.0.113.10:22',
      reconnectAttempt: 0
    })
    expect(getLastSshConnectFailure(targetId)?.reason).toBe('timeout')
    noteSshStateForLastFailure(targetId, {
      targetId,
      status: 'disconnected',
      error: null,
      reconnectAttempt: 0
    })
    expect(getLastSshConnectFailure(targetId)?.reason).toBe('timeout')
    noteSshStateForLastFailure(targetId, {
      targetId,
      status: 'connected',
      error: null,
      reconnectAttempt: 0
    })
    expect(getLastSshConnectFailure(targetId)).toBeUndefined()
  })

  it('falls back to the thrown error when the connect published nothing', () => {
    const targetId = 'ssh-thrown-test'
    forgetLastSshConnectFailure(targetId)
    noteSshConnectErrorForLastFailure(
      targetId,
      new Error('connect ECONNREFUSED 1.2.3.4:22'),
      undefined
    )
    expect(getLastSshConnectFailure(targetId)?.reason).toBe('refused')
  })
})
