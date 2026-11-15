import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DolphindActivationRecord } from '../../managed-server/activation/dolphind-activation-record'
import { recordDolphindUpdateFailedThisLaunch } from '../../managed-server/lifecycle/dolphind-managed-update-failure-memory'
import type { ServeReadiness } from '../../server/serve-readiness'

import type { DolphindSlotOptions } from '../../managed-server/activation/dolphind-recovery-slot'
import { getRemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import { admitWslDolphindUpdate } from './wsl-dolphind-update-admission'

const { adoptRunningDolphindVersion, readDolphindActivationRecord } = vi.hoisted(() => ({
  adoptRunningDolphindVersion: vi.fn(),
  readDolphindActivationRecord: vi.fn()
}))

vi.mock('../../managed-server/activation/dolphind-running-version-adoption', () => ({
  adoptRunningDolphindVersion
}))
vi.mock('../../managed-server/activation/dolphind-activation-record-store', () => ({
  readDolphindActivationRecord
}))

// Mixed versions between this desktop and a WSL distro's dolphind: they update independently.
const OLDER = '1.5.0+aaaaaaaaaaaa'
const NEWER = '1.6.0+bbbbbbbbbbbb'
const slot: DolphindSlotOptions = {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: every host call is mocked at its module.
  conn: {} as DolphindSlotOptions['conn'],
  host: getRemoteHostPlatform('linux-x64'),
  remoteHome: '/home/u',
  nodePath: '',
  userDataDir: '/home/u/.dolphin',
  bindHost: '127.0.0.1',
  port: 6768
}
const readiness: ServeReadiness = {
  runtimeId: 'wsl-runtime',
  boundEndpoint: '127.0.0.1:6768',
  advertisedEndpoint: null,
  managedWslCliReconciliation: 'settled',
  pairing: { available: false, reason: 'disabled_by_operator', guidance: '' }
}
let hostSeq = 0

function running(version: string, appVersion: string): DolphindActivationRecord {
  return {
    schemaVersion: 1,
    active: version,
    previous: null,
    activatedAt: '2026-10-01T00:00:00.000Z',
    snapshot: null,
    activeAppVersion: appVersion
  }
}

function admit(
  record: DolphindActivationRecord,
  desktop: { candidateVersion: string; appVersion: string },
  options: { intent?: 'connect' | 'update' | 'force'; host?: { kind: 'wsl'; id: string } } = {}
) {
  return admitWslDolphindUpdate({
    slot,
    record,
    ...desktop,
    host: options.host ?? { kind: 'wsl', id: `Ubuntu-${(hostSeq += 1)}` },
    intent: options.intent ?? 'connect'
  })
}

beforeEach(() => {
  adoptRunningDolphindVersion.mockReset()
  readDolphindActivationRecord.mockReset()
})

describe('WSL dolphind admission across desktop and host versions', () => {
  describe('an older desktop meets the dolphind a newer desktop deployed', () => {
    const olderDesktop = { candidateVersion: OLDER, appVersion: '1.5.0' }

    it('keeps the newer dolphind serving its terminals, with no Update hint', async () => {
      adoptRunningDolphindVersion.mockResolvedValue({ version: NEWER, readiness, reprobe: vi.fn() })
      for (const intent of ['connect', 'update'] as const) {
        expect(await admit(running(NEWER, '1.6.0'), olderDesktop, { intent })).toEqual({
          action: 'serve',
          version: NEWER,
          readiness,
          deferredUpdate: null
        })
      }
      expect(adoptRunningDolphindVersion).toHaveBeenCalledWith(slot, running(NEWER, '1.6.0'), OLDER)
    })
  })

  describe('a newer desktop meets the dolphind an older desktop deployed', () => {
    const newerDesktop = { candidateVersion: NEWER, appVersion: '1.6.0' }

    it('keeps the older dolphind serving after a failed update, and offers Force', async () => {
      const host = { kind: 'wsl' as const, id: 'Ubuntu-failed' }
      recordDolphindUpdateFailedThisLaunch(host, { code: 'dolphind_activation_failed', reason: 'boom' })
      adoptRunningDolphindVersion.mockResolvedValue({ version: OLDER, readiness, reprobe: vi.fn() })
      expect(await admit(running(OLDER, '1.5.0'), newerDesktop, { host })).toEqual({
        action: 'serve',
        version: OLDER,
        readiness,
        deferredUpdate: {
          candidateVersion: NEWER,
          code: 'dolphind_activation_failed',
          reason: 'boom',
          forceable: true
        }
      })
    })
  })
})
