import { describe, expect, it } from 'vitest'
import {
  classifyWslDolphindLiveness,
  nextWslLivenessProbe,
  type WslLivenessEvidence
} from './wsl-dolphind-liveness-verdict'

const INSTANCE = 'boot-a:100'
const DOLPHIND = '321:5000'

function evidence(overrides: Partial<WslLivenessEvidence> = {}): WslLivenessEvidence {
  return {
    trigger: { source: 'bridge', code: 1 },
    running: { status: 'confirmed', running: true },
    expected: { distroInstance: INSTANCE, dolphind: DOLPHIND },
    ...overrides
  }
}

describe('classifyWslDolphindLiveness', () => {
  it('reads a failed running-list probe as unverifiable, never exited, whatever the exit code', () => {
    for (const code of [0, 1, null]) {
      const verdict = classifyWslDolphindLiveness(
        evidence({ trigger: { source: 'bridge', code }, running: { status: 'unavailable' } })
      )
      expect(verdict).toEqual({ kind: 'unverifiable', reason: 'running-list-unavailable' })
    }
  })

  it('marks every terminal exited when the distro is confirmed stopped', () => {
    const verdict = classifyWslDolphindLiveness(
      evidence({ running: { status: 'confirmed', running: false } })
    )
    expect(verdict).toEqual({ kind: 'distro-stopped', corroborated: true })
  })

  it('needs no exit code to prove a stop, but only a failed exit corroborates it', () => {
    const stopped = { status: 'confirmed', running: false } as const
    expect(
      classifyWslDolphindLiveness(evidence({ trigger: { source: 'verify' }, running: stopped }))
    ).toEqual({ kind: 'distro-stopped', corroborated: false })
    expect(
      classifyWslDolphindLiveness(
        evidence({ trigger: { source: 'holder', code: 0 }, running: stopped })
      )
    ).toEqual({ kind: 'distro-stopped', corroborated: false })
  })

  it('treats a running distro whose guest did not answer as unverifiable', () => {
    expect(classifyWslDolphindLiveness(evidence({ identity: null }))).toEqual({
      kind: 'unverifiable',
      reason: 'guest-unanswered'
    })
  })

  it('proves a restart from a new boot id or pid 1 start time, without any wall clock', () => {
    const verdict = classifyWslDolphindLiveness(
      evidence({ identity: { distroInstance: 'boot-a:900', dolphind: null } })
    )
    expect(verdict).toEqual({ kind: 'distro-restarted' })
  })

  it('reads a gone or reused dolphind pid in the same incarnation as dolphind exited', () => {
    for (const dolphind of [null, '321:7777']) {
      const verdict = classifyWslDolphindLiveness(
        evidence({
          trigger: { source: 'bridge', code: 0 },
          identity: { distroInstance: INSTANCE, dolphind }
        })
      )
      expect(verdict).toEqual({ kind: 'dolphind-exited' })
    }
  })

  it('keeps dolphind live when the same process still runs, even after a bridge exit', () => {
    expect(
      classifyWslDolphindLiveness(
        evidence({
          trigger: { source: 'bridge', code: 0 },
          identity: { distroInstance: INSTANCE, dolphind: DOLPHIND }
        })
      )
    ).toEqual({ kind: 'live' })
  })

  it('falls back to the port when no dolphind pid was known', () => {
    const base = evidence({
      expected: { distroInstance: INSTANCE, dolphind: null },
      identity: { distroInstance: INSTANCE, dolphind: null }
    })
    expect(classifyWslDolphindLiveness({ ...base, dolphindPort: 'ready' })).toEqual({
      kind: 'live'
    })
    expect(classifyWslDolphindLiveness({ ...base, dolphindPort: 'refused' })).toEqual({
      kind: 'dolphind-exited'
    })
    expect(classifyWslDolphindLiveness({ ...base, dolphindPort: 'unverifiable' })).toEqual({
      kind: 'unverifiable',
      reason: 'dolphind-unanswered'
    })
  })
})

describe('nextWslLivenessProbe', () => {
  it('never probes inside a distro that is not confirmed running (an exec would boot it)', () => {
    expect(nextWslLivenessProbe(evidence({ running: { status: 'unavailable' } }))).toBeNull()
    expect(
      nextWslLivenessProbe(evidence({ running: { status: 'confirmed', running: false } }))
    ).toBeNull()
  })

  it('asks for identity first, and for the port only when no pid identity can decide', () => {
    expect(nextWslLivenessProbe(evidence())).toBe('identity')
    expect(
      nextWslLivenessProbe(evidence({ identity: { distroInstance: INSTANCE, dolphind: DOLPHIND } }))
    ).toBeNull()
    const noPid = evidence({
      expected: { distroInstance: INSTANCE, dolphind: null },
      identity: { distroInstance: INSTANCE, dolphind: null }
    })
    expect(nextWslLivenessProbe(noPid)).toBe('dolphind-port')
    expect(nextWslLivenessProbe({ ...noPid, dolphindPort: 'refused' })).toBeNull()
    expect(
      nextWslLivenessProbe({ ...noPid, identity: { distroInstance: 'other', dolphind: null } })
    ).toBeNull()
  })
})
