import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ExecCommandModule from '../../ssh/remote-exec/remote-exec-command'

vi.mock('../../ssh/remote-exec/remote-exec-command', async (importOriginal) => ({
  ...(await importOriginal<typeof ExecCommandModule>()),
  execCommand: vi.fn()
}))
vi.mock('../../managed-server/install/dolphind-local-build-hash', () => ({
  computeLocalDolphindBuildHash: () => 'abc123def4567890'
}))

import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import { getRemoteHostPlatform } from '../../ssh/remote-host/ssh-remote-platform'
import type { DolphindHostTransport } from '../../managed-server/install/dolphind-host-transport'
import { emptyDolphindActivationRecord } from '../../managed-server/activation/dolphind-activation-record'
import { DolphindActiveReadinessError } from '../../managed-server/activation/dolphind-active-readiness'
import { probeWslActiveDolphind, wslDolphindActiveProbeCommand } from './wsl-dolphind-active-probe'

const mockExec = vi.mocked(execCommand)
const VERSION = '0.1.0+aa'
const END = '\n__DOLPHIN_WSL_ACTIVE_PROBE_END__\n'
const host = getRemoteHostPlatform('linux-x64')
const context = {
  activationRecord: emptyDolphindActivationRecord(),
  serverTarget: 'linux-x64-glibc' as const,
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: execCommand is mocked, so the transport is never used.
  connection: {} as DolphindHostTransport,
  host,
  remoteHome: '/home/u',
  target: { kind: 'wsl' as const, id: 'wsl:u', distro: 'U', label: 'U' },
  userDataDir: '/home/u/.dolphin'
}
const READY = JSON.stringify({
  type: 'dolphin_server_ready',
  schemaVersion: 1,
  runtimeId: 'r1',
  boundEndpoint: 'ws://127.0.0.1:6790',
  advertisedEndpoint: null,
  managedWslCliReconciliation: 'settled',
  pairing: { available: false, reason: 'disabled_by_operator', guidance: 'n/a' },
  health: {
    buildHash: 'abc123def4567890',
    buildVersion: VERSION,
    nodeVersion: '20.11.0',
    nodeAbi: '115',
    platform: 'linux',
    arch: 'x64',
    pid: 1,
    terminalDaemon: {
      state: 'live',
      ownsFreshSessions: true,
      pid: 2,
      buildVersion: VERSION,
      entryPath: '/x/daemon-entry.js',
      protocolVersion: 3,
      selfTest: { ok: true, coverage: 'pty-spawn', verdict: 'healthy', durationMs: 5 }
    }
  }
})

const probe = () => probeWslActiveDolphind(context, '/local/dolphind', VERSION)

beforeEach(() => {
  mockExec.mockReset()
})

describe('probeWslActiveDolphind', () => {
  it('reads liveness, readiness and the pid in one exec, in that order', async () => {
    mockExec.mockResolvedValueOnce(`LIVE\n${END}${READY}\n${END}4242\n`)
    await expect(probe()).resolves.toMatchObject({ readiness: { runtimeId: 'r1' }, pid: 4242 })
    expect(mockExec).toHaveBeenCalledOnce()
    const command = wslDolphindActiveProbeCommand(context, VERSION)
    const at = (needle: string) => command.lastIndexOf(needle)
    expect(at('dolphind_alive')).toBeLessThan(at('head -c'))
    expect(at('head -c')).toBeLessThan(at("cat '/home/u/.dolphin-remote/dolphind-0.1.0+aa/.dolphind-pid'"))
  })

  it('judges the answers as the separate probes do', async () => {
    mockExec.mockResolvedValueOnce(`DEAD\n${END}${END}\n`)
    await expect(probe()).rejects.toMatchObject({ verdict: 'exited' })
    mockExec.mockResolvedValueOnce(`UNKNOWN\n${END}${READY}\n${END}4242\n`)
    await expect(probe()).rejects.toMatchObject({ verdict: 'unverifiable' })
    mockExec.mockResolvedValueOnce(`LIVE\n${END}${READY.replace('abc123', 'fff123')}\n${END}1\n`)
    await expect(probe()).rejects.toMatchObject({ verdict: 'rejected' })
  })

  it('reports an answer of another shape as unverifiable, never exited', async () => {
    mockExec.mockResolvedValueOnce('LIVE\n')
    const error = await probe().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(DolphindActiveReadinessError)
    expect(error).toMatchObject({ verdict: 'unverifiable' })
  })
})
