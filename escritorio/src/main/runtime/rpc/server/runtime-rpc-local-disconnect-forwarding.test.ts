import '../unused-default-rpc-methods.test-fixture'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { DolphinRuntimeService } from '../../dolphin-runtime'
import { defineMethod } from '../core'
import { DolphinRuntimeRpcServer } from './runtime-rpc'
import {
  _resetDolphindFeatureReadinessForTests,
  installDolphindFeatureReadiness
} from '../dolphind-feature-readiness'

// A short RPC gets no handler signal, but a caller that disconnects mid feature-wait is never run.
it('refuses a gated short RPC whose local caller disconnects while it waits', async () => {
  const userDataPath = mkdtempSync(join(tmpdir(), 'local-disconnect-feature-wait-'))
  const ran = vi.fn()
  const readiness = installDolphindFeatureReadiness()
  const server = new DolphinRuntimeRpcServer({
    runtime: new DolphinRuntimeService(),
    userDataPath,
    methods: [
      defineMethod({
        name: 'aiVault.searchStatus',
        requires: ['sessionSearch'],
        permission: 'workspace',
        params: null,
        handler: () => {
          ran()
          return {}
        }
      })
    ]
  })
  const disconnect = new AbortController()
  try {
    const pending = server['handleMessage'](
      JSON.stringify({
        id: 'req-1',
        method: 'aiVault.searchStatus',
        authToken: server['authToken']
      }),
      { signal: disconnect.signal, startKeepalive: vi.fn() }
    )
    disconnect.abort()
    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: 'runtime_unavailable' }
    })
    readiness.open('sessionSearch')
    await Promise.resolve()
    expect(ran).not.toHaveBeenCalled()
  } finally {
    _resetDolphindFeatureReadinessForTests()
    await server.stop()
    rmSync(userDataPath, { recursive: true, force: true })
  }
})
