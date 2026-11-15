import { rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'

import {
  moveManagedDolphindLocalPort,
  recordManagedDolphindMigration,
  refreshManagedDolphindPairing
} from '../../../shared/remote-runtime/host-store/runtime-environment-managed-dolphind-store'
import { encodePairingOffer } from '../../../shared/remote-runtime/pairing/pairing'
import { PAIRING_OFFER_VERSION } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'

import { dolphindMigrationCutoverFixture } from '../migration/cutover/testing/dolphind-migration-cutover-fixture'
import { writeDolphindMigrationSourceCutover } from '../../persistence/migrating-dolphind-catalog/dolphind-migration-cutover-journal'
import {
  createManagedLifecycleHarness,
  MANAGED_LOCAL_PORT,
  MANAGED_PREVIOUS_VERSION,
  MANAGED_VERSION,
  managedReadiness
} from './dolphind-managed-lifecycle-test-fixture'

const mocks = vi.hoisted(() => {
  const state: { store: unknown } = { store: null }
  return {
    state,
    resolveContext: vi.fn(),
    census: vi.fn(),
    deploy: vi.fn(),
    rollback: vi.fn(),
    recover: vi.fn(),
    probe: vi.fn(),
    buildHash: vi.fn(),
    ensureTunnel: vi.fn(),
    rebuildTunnel: vi.fn(),
    wake: vi.fn(),
    pendingMigration: vi.fn()
  }
})

vi.mock('../../ssh/targets/ssh-target-registry', () => ({
  getSshConnectionManager: () => ({ connect: async () => ({}) }),
  getSshTargetRegistryStore: () => mocks.state.store
}))
vi.mock('../install/dolphind-remote-context', () => ({
  resolveDolphindRemoteContext: mocks.resolveContext
}))
vi.mock('./dolphind-terminal-census-client', () => ({ collectManagedTerminalCensus: mocks.census }))
vi.mock('../install/dolphind-remote-deploy', () => ({ deployDolphind: mocks.deploy }))
vi.mock('../install/dolphind-remote-rollback', () => ({
  rollbackDolphind: mocks.rollback
}))
vi.mock('../activation/dolphind-activation-recovery', () => ({
  recoverInterruptedDolphindActivation: mocks.recover
}))
vi.mock('../activation/dolphind-active-readiness', () => ({ probeActiveDolphindReadiness: mocks.probe }))
vi.mock('../install/dolphind-remote-build-hash', () => ({
  readRemoteDolphindBuildHash: mocks.buildHash
}))
vi.mock('../../dolphind/dolphind-artifact-materializer', () => ({
  materializeDolphindArtifact: async () => '/local/dolphind'
}))
vi.mock('../install/dolphind-local-build-hash', () => ({
  computeLocalDolphindBuildHash: () => 'local-hash'
}))
vi.mock('./dolphind-managed-tunnel', () => ({
  ensureDolphindManagedTunnel: mocks.ensureTunnel,
  rebuildDolphindManagedTunnel: mocks.rebuildTunnel
}))
vi.mock('./dolphind-managed-wake', () => ({
  wakeStoppedManagedDolphind: mocks.wake
}))
vi.mock('./dolphind-managed-migration-status', () => ({
  findIncompleteManagedDolphindMigration: mocks.pendingMigration
}))
vi.mock('../activation/dolphind-activation-transaction-store', () => ({
  readDolphindActivationTransaction: async () => null
}))

const { getManagedDolphindRuntimeStatus } = await import('./dolphind-runtime-status')
const { updateManagedDolphindEnvironment } = await import('./dolphind-runtime-maintenance')
const { recoverManagedDolphindEnvironment } = await import('./dolphind-managed-recovery')
const { rollbackManagedDolphindEnvironment } = await import('./dolphind-managed-rollback')

const idle = { liveSessions: 0, startedSinceActivation: 0, daemonProtocolVersion: 7 }
let harness: ReturnType<typeof createManagedLifecycleHarness>

beforeEach(() => {
  vi.resetAllMocks()
  harness = createManagedLifecycleHarness()
  mocks.state.store = harness.targetStore
  mocks.resolveContext.mockImplementation(async () => harness.context())
  mocks.census.mockResolvedValue(idle)
  mocks.probe.mockResolvedValue(managedReadiness())
  mocks.buildHash.mockResolvedValue('previous-hash')
  mocks.recover.mockResolvedValue({ outcome: 'none' })
  mocks.wake.mockResolvedValue({ outcome: 'serving' })
})

afterEach(() => rmSync(harness.userDataPath, { recursive: true, force: true }))

function expectEnrolledPairing(): void {
  const [environment] = listEnvironments(harness.userDataPath)
  expect(environment?.endpoints[0]?.deviceToken).toBe('device-token')
  expect(environment?.pairingRevision).toBe(harness.environment.pairingRevision)
  expect(environment?.dolphindDeployment).toEqual(harness.environment.dolphindDeployment)
}

describe('updateManagedDolphindEnvironment', () => {
  it('defers over live or unverifiable terminals and reports the deferral in status', async () => {
    mocks.census.mockResolvedValue({ ...idle, liveSessions: null })
    mocks.deploy.mockResolvedValueOnce({
      outcome: 'installed-not-activated',
      fullVersion: '0.3.0+new',
      code: 'dolphind_update_terminal_census_unavailable',
      reason: 'The terminal daemon did not answer a session count.'
    })
    const result = await updateManagedDolphindEnvironment(harness.userDataPath, {
      selector: 'Managed'
    })
    expect(result).toMatchObject({ outcome: 'deferred', forceable: false })
    expect(mocks.deploy.mock.calls[0]?.[0]).toMatchObject({
      census: { liveSessions: null },
      port: 6_768,
      nodePath: ''
    })
    const status = await getManagedDolphindRuntimeStatus(harness.userDataPath, 'Managed')
    expect(status.deferredUpdate).toMatchObject({
      candidateVersion: '0.3.0+new',
      code: 'dolphind_update_terminal_census_unavailable'
    })
    expect(status.terminals.liveSessions).toBeNull()
  })

  it('clears the deferral once an update goes through and keeps an unchanged pairing as is', async () => {
    mocks.deploy.mockResolvedValueOnce({
      outcome: 'installed-not-activated',
      fullVersion: '0.3.0+new',
      code: 'dolphind_update_terminals_running',
      reason: 'busy'
    })
    await updateManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    mocks.deploy.mockResolvedValueOnce({
      outcome: 'installed-and-activated',
      fullVersion: '0.3.0+new'
    })
    const result = await updateManagedDolphindEnvironment(harness.userDataPath, {
      selector: 'Managed',
      force: true
    })
    expect(result).toMatchObject({ outcome: 'updated', activeVersion: '0.3.0+new' })
    expect(mocks.probe).toHaveBeenCalledWith(expect.anything(), {
      buildHash: 'local-hash',
      fullVersion: '0.3.0+new'
    })
    const [environment] = listEnvironments(harness.userDataPath)
    expect(environment?.pairingRevision).toBe(harness.environment.pairingRevision)
    expect(environment?.dolphindDeployment).toEqual(harness.environment.dolphindDeployment)
    const status = await getManagedDolphindRuntimeStatus(harness.userDataPath, 'Managed')
    expect(status.deferredUpdate).toBeNull()
  })

  it('still reports the activation when the new forward cannot be built yet', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.deploy.mockResolvedValueOnce({ outcome: 'installed-and-activated', fullVersion: 'v3' })
    mocks.rebuildTunnel.mockRejectedValueOnce(new Error('ssh connect failed'))
    await expect(
      updateManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    ).resolves.toMatchObject({ outcome: 'updated', activeVersion: 'v3' })
  })

  it('keeps a pairing the terminal count repaired, not the one read before it', async () => {
    mocks.census.mockImplementationOnce(async () => {
      refreshManagedDolphindPairing(
        harness.userDataPath,
        'environment-1',
        encodePairingOffer({
          v: PAIRING_OFFER_VERSION,
          endpoint: `ws://127.0.0.1:${MANAGED_LOCAL_PORT}/`,
          deviceToken: 'repaired-token',
          publicKeyB64: 'public-key'
        })
      )
      return idle
    })
    mocks.deploy.mockResolvedValueOnce({ outcome: 'already-active', fullVersion: MANAGED_VERSION })
    mocks.probe.mockResolvedValueOnce(managedReadiness('startup-offer-token'))
    await updateManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    const [environment] = listEnvironments(harness.userDataPath)
    expect(environment?.endpoints[0]?.deviceToken).toBe('repaired-token')
  })

  it('keeps the enrolled grant when the updated server offers a new device', async () => {
    mocks.deploy.mockResolvedValueOnce({ outcome: 'installed-and-activated', fullVersion: 'v3' })
    mocks.probe.mockResolvedValueOnce(managedReadiness('startup-offer-token'))
    await updateManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    expectEnrolledPairing()
  })

  it('saves the new pairing on the tunnel port the census moved to', async () => {
    mocks.census.mockImplementationOnce(async () => {
      moveManagedDolphindLocalPort(harness.userDataPath, 'environment-1', MANAGED_LOCAL_PORT + 1)
      return idle
    })
    mocks.deploy.mockResolvedValueOnce({ outcome: 'installed-and-activated', fullVersion: 'v3' })
    mocks.probe.mockResolvedValueOnce(managedReadiness())

    await updateManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })

    const [environment] = listEnvironments(harness.userDataPath)
    expect(environment?.dolphindDeployment?.localPort).toBe(MANAGED_LOCAL_PORT + 1)
    expect(environment?.endpoints[0]?.endpoint).toBe(`ws://127.0.0.1:${MANAGED_LOCAL_PORT + 1}/`)
  })
})

describe('updateManagedDolphindEnvironment on a host already running this build', () => {
  beforeEach(() => {
    mocks.deploy.mockResolvedValue({ outcome: 'already-active', fullVersion: MANAGED_VERSION })
  })

  it('starts a slot proven stopped and forwards to the port it bound', async () => {
    mocks.wake.mockResolvedValueOnce({ outcome: 'started', readiness: managedReadiness() })
    await expect(
      updateManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    ).resolves.toMatchObject({ outcome: 'already-current', activeVersion: MANAGED_VERSION })
    expect(mocks.wake.mock.calls[0]?.[0]).toMatchObject({ port: 6_768 })
    expect(mocks.rebuildTunnel).toHaveBeenCalledWith(harness.userDataPath, 'environment-1')
  })
})

describe('rollbackManagedDolphindEnvironment', () => {
  it.each([
    [{ ...idle, liveSessions: 2 }, 'dolphind_rollback_terminals_running'],
    [{ ...idle, liveSessions: null }, 'dolphind_rollback_census_unavailable']
  ])('refuses while terminals run or cannot be counted: %j', async (census, code) => {
    mocks.census.mockResolvedValue(census)
    await expect(
      rollbackManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    ).resolves.toMatchObject({ outcome: 'refused', code })
    expect(mocks.rollback).not.toHaveBeenCalled()
  })

  it('refuses with no previous version without contacting the slot', async () => {
    mocks.resolveContext.mockImplementation(async () => harness.context({ previous: null }))
    await expect(
      rollbackManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    ).resolves.toMatchObject({ outcome: 'refused', code: 'dolphind_rollback_no_target' })
    expect(mocks.census).not.toHaveBeenCalled()
  })

  it('refuses while a migration into the server is unfinished', async () => {
    mocks.pendingMigration.mockReturnValueOnce({ migrationId: 'm-1', phase: 'destination-staged' })
    await expect(
      rollbackManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    ).resolves.toMatchObject({
      outcome: 'refused',
      code: 'dolphind_rollback_migration_in_progress'
    })
    expect(mocks.rollback).not.toHaveBeenCalled()
  })

  it('refuses a rollback to a snapshot older than the migrated catalog, not a newer one', async () => {
    recordManagedDolphindMigration(harness.userDataPath, 'environment-1', '2026-02-01T00:00:00.000Z')
    await expect(
      rollbackManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    ).resolves.toMatchObject({ outcome: 'refused', code: 'dolphind_rollback_crosses_migration' })
    expect(mocks.rollback).not.toHaveBeenCalled()
    mocks.resolveContext.mockImplementation(async () =>
      harness.context({ activatedAt: '2026-03-01T00:00:00.000Z' })
    )
    mocks.rollback.mockResolvedValueOnce({ outcome: 'refused', code: 'x', reason: 'y' })
    await rollbackManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })

  it('refuses a rollback across a retained delta move that predates the mark', async () => {
    // Older deltas lack a durable mark; their retained journal must still block destructive rollback.
    writeDolphindMigrationSourceCutover(harness.userDataPath, {
      ...dolphindMigrationCutoverFixture('delta-1', 'ssh-1', { environmentId: 'environment-1' }),
      startedAt: '2026-02-01T00:00:00.000Z',
      phase: 'destination-committed',
      sourceRetainedAt: '2026-02-01T00:00:00.000Z'
    })
    await expect(
      rollbackManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    ).resolves.toMatchObject({ outcome: 'refused', code: 'dolphind_rollback_crosses_migration' })
    expect(mocks.rollback).not.toHaveBeenCalled()
  })

  it('rolls back against the installed bytes of the previous slot', async () => {
    mocks.rollback.mockResolvedValueOnce({
      outcome: 'rolled-back',
      target: MANAGED_PREVIOUS_VERSION,
      discarded: [MANAGED_VERSION],
      verdict: { decision: 'activate', coverage: 'pty-spawn', warnings: [] }
    })
    await expect(
      rollbackManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    ).resolves.toMatchObject({ outcome: 'rolled-back', activeVersion: MANAGED_PREVIOUS_VERSION })
    expect(mocks.rollback.mock.calls[0]?.[0]).toMatchObject({ targetBuildHash: 'previous-hash' })
    expect(mocks.probe).toHaveBeenCalledWith(expect.anything(), {
      buildHash: 'previous-hash',
      fullVersion: MANAGED_PREVIOUS_VERSION
    })
    expect(mocks.rebuildTunnel).toHaveBeenCalledWith(harness.userDataPath, 'environment-1')
  })

  it('keeps the enrolled grant when the restored server offers a new device', async () => {
    mocks.rollback.mockResolvedValueOnce({
      outcome: 'rolled-back',
      target: MANAGED_PREVIOUS_VERSION,
      discarded: [MANAGED_VERSION],
      verdict: { decision: 'activate', coverage: 'pty-spawn', warnings: [] }
    })
    mocks.probe.mockResolvedValueOnce(managedReadiness('startup-offer-token'))
    await rollbackManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    expectEnrolledPairing()
  })
})

describe('recoverManagedDolphindEnvironment', () => {
  it('keeps the enrolled grant when the recovered server offers a new device', async () => {
    mocks.recover.mockResolvedValueOnce({
      outcome: 'recovered',
      resolution: 'restored-incumbent',
      activeVersion: MANAGED_VERSION,
      readiness: managedReadiness('startup-offer-token')
    })
    await recoverManagedDolphindEnvironment(harness.userDataPath, { selector: 'Managed' })
    expectEnrolledPairing()
  })
})
