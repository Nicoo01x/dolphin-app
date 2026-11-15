import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DOLPHIND_UPDATE_WSL_MOVE_RUNNING_CODE } from '../../../shared/wsl-host-types'
import type { DolphindActivationRecord } from '../../managed-server/activation/dolphind-activation-record'
import type { ServeReadiness } from '../../server/serve-readiness'
import type { DolphindSlotOptions } from '../../managed-server/activation/dolphind-recovery-slot'
import { getRemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import { admitWslDolphindUpdate } from './wsl-dolphind-update-admission'

const { adoptRunningDolphindVersion } = vi.hoisted(() => ({ adoptRunningDolphindVersion: vi.fn() }))

vi.mock('../../managed-server/activation/dolphind-running-version-adoption', () => ({
  adoptRunningDolphindVersion
}))
vi.mock('../../managed-server/activation/dolphind-activation-record-store', () => ({
  readDolphindActivationRecord: vi.fn()
}))

const RUNNING = '1.5.0+aaaaaaaaaaaa'
const BUNDLED = '1.6.0+bbbbbbbbbbbb'
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
const record: DolphindActivationRecord = {
  schemaVersion: 1,
  active: RUNNING,
  previous: null,
  activatedAt: '2026-10-01T00:00:00.000Z',
  snapshot: null,
  activeAppVersion: '1.5.0'
}
let hostSeq = 0

function admit(intent: 'connect' | 'update' | 'force', moveRunning: boolean) {
  return admitWslDolphindUpdate({
    slot,
    record,
    candidateVersion: BUNDLED,
    appVersion: '1.6.0',
    host: { kind: 'wsl', id: `Ubuntu-${(hostSeq += 1)}` },
    intent,
    moveRunning
  })
}

beforeEach(() => {
  adoptRunningDolphindVersion.mockReset()
  adoptRunningDolphindVersion.mockResolvedValue({ version: RUNNING, readiness, reprobe: vi.fn() })
})

describe('a WSL dolphind update while a project moves onto the host', () => {
  it.each(['connect', 'update', 'force'] as const)(
    'keeps the running server for the move on %s, and says the update waits for it',
    async (intent) => {
      expect(await admit(intent, true)).toEqual({
        action: 'serve',
        version: RUNNING,
        readiness,
        deferredUpdate: {
          candidateVersion: BUNDLED,
          code: DOLPHIND_UPDATE_WSL_MOVE_RUNNING_CODE,
          reason: expect.stringContaining('once the move finishes'),
          forceable: false
        }
      })
    }
  )

  it('updates as before once no move runs', async () => {
    expect(await admit('connect', false)).toEqual({ action: 'deploy', record })
    expect(adoptRunningDolphindVersion).not.toHaveBeenCalled()
  })
})
