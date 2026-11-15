import { describe, expect, it, vi } from 'vitest'
import {
  emptyDolphindActivationRecord,
  type DolphindActivationRecord
} from '../activation/dolphind-activation-record'

const mocks = vi.hoisted(() => {
  const state: { record: DolphindActivationRecord | null } = { record: null }
  return {
    state,
    materialize: vi.fn(async (_target: string) => '/cache/dolphind'),
    runUpdate: vi.fn(),
    migrating: vi.fn((_userData: string, _environmentId: string): unknown => null)
  }
})

vi.mock('./dolphind-managed-lifecycle', () => ({
  withManagedDolphindLifecycle: (
    _userData: string,
    _selector: string,
    run: (managed: unknown) => Promise<unknown>
  ) => run({ environment: { id: 'env-1' }, deployment: {} })
}))
vi.mock('./dolphind-runtime-maintenance', () => ({
  runManagedDolphindUpdate: mocks.runUpdate
}))
vi.mock('./dolphind-managed-runtime-context', () => ({
  resolveLinkedDolphindContext: async () => ({
    activationRecord: mocks.state.record,
    serverTarget: 'linux-x64'
  })
}))
vi.mock('./dolphind-managed-migration-status', () => ({
  findIncompleteManagedDolphindMigration: mocks.migrating
}))
vi.mock('../../dolphind/dolphind-artifact-materializer', () => ({
  materializeDolphindArtifact: mocks.materialize
}))
vi.mock('../install/remote-versioned-install', () => ({
  readLocalFullVersion: () => '0.1.0+new'
}))

import { planManagedDolphindAutoUpdate } from './dolphind-managed-update-decision'
import { autoUpdateManagedDolphindEnvironment } from './dolphind-managed-auto-update'
import { DolphindCrashLoopError } from './dolphind-managed-crash-loop'

function record(overrides: Partial<DolphindActivationRecord>): DolphindActivationRecord {
  return { ...emptyDolphindActivationRecord(), active: '0.1.0+old', ...overrides }
}

const plan = (r: DolphindActivationRecord, extra: { failedBefore?: boolean } = {}) =>
  planManagedDolphindAutoUpdate({
    record: r,
    candidateVersion: '0.1.0+new',
    appVersion: '1.5.0',
    failedBefore: extra.failedBefore ?? false
  })

describe('whether a connect updates its managed dolphind', () => {
  it('skips a host already on this build', () => {
    expect(plan(record({ active: '0.1.0+new' }))).toEqual({ action: 'skip', reason: 'current' })
  })

  it('updates a host an older or pre-tracking Dolphin activated', () => {
    expect(plan(record({ activeAppVersion: '1.4.0' }))).toEqual({ action: 'update' })
    expect(plan(record({}))).toEqual({ action: 'update' })
  })

  it('never downgrades a host a newer Dolphin activated', () => {
    expect(plan(record({ activeAppVersion: '1.6.0' }))).toEqual({
      action: 'skip',
      reason: 'host-newer'
    })
  })

  it('leaves alone a build an explicit rollback moved away from', () => {
    expect(plan(record({ rolledBackFrom: '0.1.0+new' }))).toEqual({
      action: 'skip',
      reason: 'rolled-back'
    })
  })

  it('does not retry an update that already failed for this app version', () => {
    expect(plan(record({}), { failedBefore: true })).toEqual({
      action: 'skip',
      reason: 'failed-before'
    })
  })

  it('skips when the template carries no build for the host', () => {
    expect(
      planManagedDolphindAutoUpdate({
        record: record({}),
        candidateVersion: null,
        appVersion: '1.5.0',
        failedBefore: false
      })
    ).toEqual({ action: 'skip', reason: 'no-template' })
  })
})

describe('an auto-update that finds the host braked for crashing', () => {
  // Recording it as failed would block update retries for the rest of the session.
  it('is not an update failure: the host already runs this build', async () => {
    mocks.state.record = record({})
    mocks.runUpdate.mockRejectedValueOnce(
      new DolphindCrashLoopError('Dolphin stopped restarting its server on Box')
    )

    expect(
      await autoUpdateManagedDolphindEnvironment('/user-data', {
        environmentId: 'env-1',
        appVersion: '1.5.0',
        failedBefore: () => false,
        onUpdating: () => {}
      })
    ).toEqual({ outcome: 'skipped', reason: 'current' })
  })
})
