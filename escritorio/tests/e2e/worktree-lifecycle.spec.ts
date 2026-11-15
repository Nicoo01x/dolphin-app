// #532: removal must drop owned terminal/editor/browser state.

import { test, expect } from './helpers/dolphin-app'
import {
  waitForSessionReady,
  waitForActiveWorktree,
  getActiveWorktreeId,
  getAllWorktreeIds,
  getWorktreeTabs,
  getOpenFiles,
  getBrowserTabs,
  switchToWorktree,
  ensureTerminalVisible
} from './helpers/store'
import { clickFileInExplorer, openFileExplorer } from './helpers/file-explorer'

async function createIsolatedWorktree(
  page: Parameters<typeof getActiveWorktreeId>[0]
): Promise<string> {
  const name = `e2e-lifecycle-${Date.now()}`
  return page.evaluate(async (worktreeName) => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }

    const state = store.getState()
    const activeWorktreeId = state.activeWorktreeId
    if (!activeWorktreeId) {
      throw new Error('No active worktree to derive repo from')
    }

    const activeWorktree = Object.values(state.worktreesByRepo)
      .flat()
      .find((worktree) => worktree.id === activeWorktreeId)
    if (!activeWorktree) {
      throw new Error(`Active worktree ${activeWorktreeId} not found`)
    }

    const result = await state.createWorktree(activeWorktree.repoId, worktreeName)
    await state.fetchWorktrees(activeWorktree.repoId)
    return result.worktree.id
  }, name)
}

async function removeWorktreeViaStore(
  page: Parameters<typeof getActiveWorktreeId>[0],
  worktreeId: string
): Promise<{ ok: boolean; error?: string }> {
  return page.evaluate(async (id) => {
    const store = window.__store
    if (!store) {
      return { ok: false as const, error: 'store unavailable' }
    }

    const state = store.getState()
    const result = await state.removeWorktree(
      { id, executionHostId: state.getKnownWorktreeById(id)?.hostId ?? null },
      true
    )
    return result
  }, worktreeId)
}

test.describe('Worktree Lifecycle', () => {
  // Track isolated worktrees for afterEach cleanup so aborted tests cannot leak branches/directories into the shared worker.
  let createdWorktreeId: string | null = null

  test.beforeEach(async ({ appPage }) => {
    await waitForSessionReady(appPage)
    await waitForActiveWorktree(appPage)
    await ensureTerminalVisible(appPage)
  })

  test.afterEach(async ({ appPage }) => {
    if (!createdWorktreeId) {
      return
    }
    const idToClean = createdWorktreeId
    createdWorktreeId = null
    await appPage
      .evaluate(async (id) => {
        try {
          const state = window.__store?.getState()
          await state?.removeWorktree(
            { id, executionHostId: state.getKnownWorktreeById(id)?.hostId ?? null },
            true
          )
        } catch {
          /* best-effort cleanup */
        }
      }, idToClean)
      .catch(() => undefined)
  })

  // #532: removing a worktree must drop all owned surface state.
  test('removing a worktree clears its tabs, open files, and browser tabs', async ({
    appPage
  }) => {
    const originalWorktreeId = await waitForActiveWorktree(appPage)

    createdWorktreeId = await createIsolatedWorktree(appPage)
    const newWorktreeId = createdWorktreeId
    await switchToWorktree(appPage, newWorktreeId)
    await expect
      .poll(async () => getActiveWorktreeId(appPage), { timeout: 10_000 })
      .toBe(newWorktreeId)
    await ensureTerminalVisible(appPage)

    // Seed all three surface types to require atomic cleanup.
    await appPage.evaluate((worktreeId) => {
      const store = window.__store
      if (!store) {
        return
      }

      const state = store.getState()
      state.createTab(worktreeId)
      state.createBrowserTab(worktreeId, 'about:blank', {
        title: 'lifecycle-test',
        activate: false
      })
    }, newWorktreeId)

    await openFileExplorer(appPage)
    await clickFileInExplorer(appPage, ['README.md', 'package.json'])

    expect((await getWorktreeTabs(appPage, newWorktreeId)).length).toBeGreaterThan(0)
    expect((await getBrowserTabs(appPage, newWorktreeId)).length).toBeGreaterThan(0)
    expect((await getOpenFiles(appPage, newWorktreeId)).length).toBeGreaterThan(0)

    // Remove an inactive worktree; deleting the active one follows an easier path that misses this cleanup regression.
    await switchToWorktree(appPage, originalWorktreeId)
    await expect
      .poll(async () => getActiveWorktreeId(appPage), { timeout: 10_000 })
      .toBe(originalWorktreeId)

    const result = await removeWorktreeViaStore(appPage, newWorktreeId)
    expect(result.ok).toBe(true)
    createdWorktreeId = null

    // Require all removed-worktree keyed surfaces gone to prevent a worktree-less tab strip.
    await expect
      .poll(async () => (await getWorktreeTabs(appPage, newWorktreeId)).length, {
        timeout: 10_000,
        message: 'tabsByWorktree still holds entries for the removed worktree'
      })
      .toBe(0)
    await expect
      .poll(async () => (await getBrowserTabs(appPage, newWorktreeId)).length, {
        timeout: 5_000
      })
      .toBe(0)
    await expect
      .poll(async () => (await getOpenFiles(appPage, newWorktreeId)).length, { timeout: 5_000 })
      .toBe(0)

    const allIds = await getAllWorktreeIds(appPage)
    expect(allIds).not.toContain(newWorktreeId)
  })
})
