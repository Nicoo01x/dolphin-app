import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DOLPHIND_TERMINAL_CENSUS_RUNTIME_CAPABILITY } from '../../../shared/dolphind-runtime-capabilities'
import {
  createEnvironmentFromPairingOffer,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  emptyDolphindActivationRecord,
  type DolphindActivationRecord
} from '../activation/dolphind-activation-record'

const mocks = vi.hoisted(() => ({ send: vi.fn(), ensure: vi.fn(), verify: vi.fn() }))
vi.mock('../../../shared/remote-runtime/requests/remote-runtime-request-socket', () => ({
  sendRemoteRuntimeRequestOnSocket: mocks.send
}))
vi.mock('./dolphind-managed-tunnel', () => ({
  ensureDolphindManagedTunnel: mocks.ensure
}))
vi.mock('./dolphind-managed-serving-verify', () => ({
  verifyDolphindManagedServing: mocks.verify
}))

const { collectManagedTerminalCensus } = await import('./dolphind-terminal-census-client')
const collect = (record: DolphindActivationRecord) =>
  collectManagedTerminalCensus('/profile', environment, record)

const environment: KnownRuntimeEnvironment = createEnvironmentFromPairingOffer({
  id: 'environment-1',
  name: 'Managed',
  now: 1,
  offer: { v: 2, endpoint: 'ws://127.0.0.1:46768', deviceToken: 't', publicKeyB64: 'k' },
  connectionDependency: 'ssh-tunnel'
})
const active = {
  ...emptyDolphindActivationRecord(),
  active: '1.0.0',
  activatedAt: '2026-01-01T00:00:00.000Z'
}
const unverifiable = {
  liveSessions: null,
  startedSinceActivation: null,
  daemonProtocolVersion: null
}
const census = { liveSessions: 2, startedSinceActivation: 1, daemonProtocolVersion: 7 }

function answerWith(capabilities: string[], response: unknown) {
  mocks.send.mockImplementation(
    async (_pairing, _method, _params, _timeout, _envelope, validate) => {
      validate({ ok: true, result: { capabilities } })
      return response
    }
  )
}

describe('managed dolphind terminal census client', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.ensure.mockResolvedValue(environment)
    mocks.verify.mockResolvedValue({ state: 'serving' })
  })

  it.each([
    ['an older host without the capability', () => answerWith([], { ok: true, result: census })],
    [
      'method not found',
      () =>
        answerWith([DOLPHIND_TERMINAL_CENSUS_RUNTIME_CAPABILITY], {
          ok: false,
          error: { code: 'method_not_found', message: 'no' }
        })
    ],
    [
      'a malformed answer',
      () => answerWith([DOLPHIND_TERMINAL_CENSUS_RUNTIME_CAPABILITY], { ok: true, result: {} })
    ],
    ['loss of contact', () => mocks.send.mockRejectedValue(new Error('socket closed'))]
  ])('reads %s as unverifiable, never as zero', async (_label, arrange) => {
    arrange()
    await expect(collect(active)).resolves.toEqual(unverifiable)
  })
})
