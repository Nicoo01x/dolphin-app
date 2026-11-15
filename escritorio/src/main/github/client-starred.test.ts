import type * as GitExecFileModule from '../git/command-runner/git-exec-file'
import type * as GhExecFileModule from '../git/command-runner/gh-exec-file'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as GithubApiRepositoryModule from './github-api-repository'
import type * as GitHubEnterpriseRepositoryModule from './github-enterprise-repository'
import type * as DolphinBrandModule from '../../shared/dolphin-brand'

const { clientMocks, moduleMocks } = await vi.hoisted(async () => {
  const moduleMocks = await import('./client-test-mocks')
  return { clientMocks: moduleMocks.createGitHubClientMocks(), moduleMocks }
})

vi.mock('./gh-utils', () => moduleMocks.ghUtilsModuleMock(clientMocks))
vi.mock('../git/runner', () => moduleMocks.gitRunnerModuleMock(clientMocks))

vi.mock('../git/command-runner/git-exec-file', async (importOriginal) => ({
  ...(await importOriginal<typeof GitExecFileModule>()),
  gitExecFileAsync: clientMocks.gitExecFileAsyncMock
}))

vi.mock('../git/command-runner/gh-exec-file', async (importOriginal) => ({
  ...(await importOriginal<typeof GhExecFileModule>()),
  ghExecFileAsync: clientMocks.ghExecFileAsyncMock
}))
vi.mock('./local-git-config-signature', () =>
  moduleMocks.localGitConfigSignatureModuleMock(clientMocks)
)
vi.mock('./github-enterprise-repository', async (importOriginal) =>
  moduleMocks.githubEnterpriseRepositoryModuleMock(
    await importOriginal<typeof GitHubEnterpriseRepositoryModule>()
  )
)
vi.mock('./rate-limit', () => moduleMocks.rateLimitModuleMock(clientMocks))
vi.mock('./github-api-repository', async (importOriginal) =>
  moduleMocks.githubApiRepositoryModuleMock(
    clientMocks,
    await importOriginal<typeof GithubApiRepositoryModule>()
  )
)

// Why: la estrella es la del repo de Dolphin (DOLPHIN_GITHUB_URL); los casos de gh corren con uno.
const brand = vi.hoisted(() => ({
  githubUrl: 'https://github.com/Nicoo01x/dolphin-escritorio' as string | null
}))
vi.mock('../../shared/dolphin-brand', async (importOriginal) => ({
  ...(await importOriginal<typeof DolphinBrandModule>()),
  get DOLPHIN_GITHUB_URL() {
    return brand.githubUrl
  }
}))

import { __resetDolphinStarCheckForTests, checkDolphinStarred } from './client/fetch/dolphin-star'

import { resetOriginRepositoryCache } from './client-test-harness'

const { execFileAsyncMock, ghExecFileAsyncMock, acquireMock, releaseMock } = clientMocks

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve()
  }
}

describe('checkDolphinStarred', () => {
  beforeEach(async () => {
    resetOriginRepositoryCache()
    execFileAsyncMock.mockReset()
    ghExecFileAsyncMock.mockReset()
    acquireMock.mockReset()
    releaseMock.mockReset()
    acquireMock.mockResolvedValue(undefined)
    __resetDolphinStarCheckForTests()
    brand.githubUrl = 'https://github.com/Nicoo01x/dolphin-escritorio'
  })

  it('coalesces concurrent checks onto one gh child', async () => {
    let resolveGh: (value: { stdout: string; stderr: string }) => void = () => {}
    ghExecFileAsyncMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveGh = resolve
      })
    )

    const first = checkDolphinStarred()
    const second = checkDolphinStarred()
    const third = checkDolphinStarred()
    await flushMicrotasks()

    expect(ghExecFileAsyncMock).toHaveBeenCalledTimes(1)
    expect(acquireMock).toHaveBeenCalledTimes(1)

    resolveGh({ stdout: 'HTTP/2.0 204 No Content\r\n', stderr: '' })
    await expect(Promise.all([first, second, third])).resolves.toEqual([true, true, true])
  })

  it('starts a fresh check once the previous one has settled', async () => {
    ghExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: 'HTTP/2.0 404 Not Found\r\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'HTTP/2.0 204 No Content\r\n', stderr: '' })

    await checkDolphinStarred()
    await expect(checkDolphinStarred()).resolves.toBe(true)
    expect(ghExecFileAsyncMock).toHaveBeenCalledTimes(2)
  })
})
