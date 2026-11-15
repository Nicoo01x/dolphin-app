import { describe, expect, it, vi } from 'vitest'
import { EMPTY_FORM } from '../ssh-host-form/ssh-target-draft'
import type { DolphindSshProvisioningResult } from '../../../../shared/dolphind-ssh-provisioning'
import {
  installDolphinServerOnSsh,
  newProvisioningRequestId,
  type ServerInstallApi
} from './install-dolphin-server-on-ssh'

const FORM = { ...EMPTY_FORM, host: 'openclaw.example', username: 'root' }

function apiThatAnswers(
  result: DolphindSshProvisioningResult['result'],
  repoReadoptions: DolphindSshProvisioningResult['repoReadoptions'] = []
): ServerInstallApi {
  return {
    createSshHost: vi.fn(async (args) => ({
      requestId: args.requestId,
      name: args.name,
      sshTargetId: 'target-1',
      repoReadoptions,
      result
    }))
  }
}

async function install(api: ServerInstallApi, name = 'openclaw') {
  return installDolphinServerOnSsh({ form: FORM, name, requestId: 'prov-1', api })
}

describe('installDolphinServerOnSsh', () => {
  it('reports the machine as ready when the server was installed', async () => {
    const api = apiThatAnswers({
      outcome: 'created',
      environment: { id: 'env-1' } as never,
      activeVersion: '1.0.0'
    })
    await expect(install(api)).resolves.toEqual({ kind: 'ready', name: 'openclaw' })
  })

  it('treats a server that was already there as ready, not as a second install', async () => {
    const api = apiThatAnswers({
      outcome: 'already-current',
      environment: { id: 'env-1' } as never,
      activeVersion: '1.0.0'
    })
    await expect(install(api)).resolves.toMatchObject({ kind: 'ready' })
  })

  it('says the host was kept as a plain SSH host when it already had projects', async () => {
    // Not a failure: the machine WAS added. Reporting it as one hid that from the person who
    // then could not find their own host in the list.
    const api = apiThatAnswers({ outcome: 'pending', reason: 'This host already has projects.' }, [
      { oldTargetId: 'a', newTargetId: 'b' } as never
    ])
    await expect(install(api)).resolves.toEqual({
      kind: 'kept-as-host',
      reason: 'This host already has projects.'
    })
  })

  it('hands back the request id when the install did not finish, so it can be resumed', async () => {
    const api = apiThatAnswers({ outcome: 'pending', reason: 'The host closed the connection.' })
    await expect(install(api)).resolves.toEqual({
      kind: 'unfinished',
      reason: 'The host closed the connection.',
      requestId: 'prov-1'
    })
  })

  it('refuses a machine with no name before touching the host', async () => {
    const api = apiThatAnswers({ outcome: 'pending', reason: 'never asked' })
    await expect(install(api, '   ')).resolves.toMatchObject({ kind: 'invalid' })
    expect(api.createSshHost).not.toHaveBeenCalled()
  })

  it('refuses a form with no host before touching anything', async () => {
    const api = apiThatAnswers({ outcome: 'pending', reason: 'never asked' })
    const outcome = await installDolphinServerOnSsh({
      form: { ...EMPTY_FORM, host: '   ' },
      name: 'openclaw',
      requestId: 'prov-1',
      api
    })
    expect(outcome.kind).toBe('invalid')
    expect(api.createSshHost).not.toHaveBeenCalled()
  })

  it('carries the error from the host through instead of a generic message', async () => {
    const api: ServerInstallApi = {
      createSshHost: vi.fn(async () => {
        throw new Error('Permission denied (publickey).')
      })
    }
    await expect(install(api)).resolves.toEqual({
      kind: 'failed',
      message: 'Permission denied (publickey).'
    })
  })
})

it('makes a different request id per attempt', () => {
  // The main process keys the whole provisioning on it: two attempts sharing an id would be
  // read as the same one, and a retry would answer with the first attempt's result.
  expect(newProvisioningRequestId()).not.toBe(newProvisioningRequestId())
})
