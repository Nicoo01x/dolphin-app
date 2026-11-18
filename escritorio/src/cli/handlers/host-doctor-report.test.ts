import { describe, expect, it } from 'vitest'
import { buildHostDoctorReport, formatHostDoctorReport } from './host-doctor-report'
import { sshDestination } from './host-doctor-hints'

const target = {
  id: 'ssh-1',
  label: 'my-vps',
  endpoint: 'root@203.0.113.10:22',
  address: '203.0.113.10',
  user: 'root',
  port: 22
}

describe('buildHostDoctorReport', () => {
  it('is ok only when SSH is connected and the server answers', () => {
    const report = buildHostDoctorReport({
      target,
      state: {
        targetId: 'ssh-1',
        status: 'connected',
        error: null,
        reconnectAttempt: 0,
        remotePlatform: 'linux',
        managedServer: { kind: 'managed', environmentId: 'env-1' }
      },
      connectAttempted: false
    })
    expect(report).toMatchObject({ ok: true, server: 'running', platform: 'linux', nextSteps: [] })
    expect(report.reason).toBeUndefined()
    expect(formatHostDoctorReport(report)).toContain('OK: this host is connected and ready.')
  })

  it('turns an auth failure into the probe and the key install, with this host’s details', () => {
    const report = buildHostDoctorReport({
      target,
      state: null,
      lastFailure: { reason: 'auth', nextStep: 'The host didn’t accept any sign-in.' },
      connectError: 'SSH authentication failed',
      connectAttempted: true
    })
    expect(report.ok).toBe(false)
    expect(report.checks.find((check) => check.name === 'ssh')?.status).toBe('fail')
    expect(report.nextSteps.join('\n')).toContain(
      'ssh -o BatchMode=yes -o ConnectTimeout=10 root@203.0.113.10 true'
    )
    expect(report.nextSteps.join('\n')).toContain('ssh-copy-id root@203.0.113.10')
    expect(report.nextSteps.at(-1)).toContain('dolphin host doctor ssh-1')
  })

  it('separates a server failure from SSH, which did work', () => {
    const report = buildHostDoctorReport({
      target,
      state: null,
      lastFailure: {
        reason: 'server:unavailable:artifacts_unavailable',
        nextStep: 'Update Dolphin on this computer.'
      },
      connectAttempted: true
    })
    expect(report.checks.map((check) => [check.name, check.status])).toEqual([
      ['ssh', 'pass'],
      ['server', 'fail']
    ])
    expect(report.nextSteps[0]).toContain('Update Dolphin')
  })

  it('falls back to the runtime’s generic message from an older runtime, redacted', () => {
    const report = buildHostDoctorReport({
      target,
      state: null,
      connectError: 'failed with TOKEN=abc123',
      connectAttempted: true
    })
    expect(report.reason).toBe('unknown')
    expect(JSON.stringify(report)).not.toContain('abc123')
  })
})

describe('sshDestination', () => {
  it('spells the port, key and a quoted path the way ssh takes them', () => {
    expect(
      sshDestination({ ...target, port: 2222, identityFile: '/home/me/my keys/id_ed25519' })
    ).toBe("-p 2222 -i '/home/me/my keys/id_ed25519' root@203.0.113.10")
  })

  it('uses the ~/.ssh/config alias when the host came from there', () => {
    expect(sshDestination({ ...target, configHost: 'my-vps' })).toBe('my-vps')
  })
})
