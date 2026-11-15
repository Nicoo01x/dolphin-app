// Assert tab management through rendered DOM: setup/store writes alone previously passed despite render crashes (#1186/#1193).
// Hidden-window drag setup may use production store actions, but final selection/order/count assertions still read DOM.

import { rm } from 'node:fs/promises'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/dolphin-app'
import {
  waitForSessionReady,
  waitForActiveWorktree,
  getActiveWorktreeId,
  getActiveTabId,
  getActiveTabType,
  getWorktreeTabs,
  getTabBarOrder,
  ensureTerminalVisible,
  waitForStartupWorktreeRefresh
} from './helpers/store'

const SORTABLE_TAB = '[data-testid="sortable-tab"]'

function tabLocator(page: Page, tabId: string) {
  return page.locator(`${SORTABLE_TAB}[data-tab-id="${tabId}"]`).first()
}

async function closeTabFromTabBar(page: Page, tabId: string): Promise<void> {
  const tab = tabLocator(page, tabId)
  await tab.hover()
  await tab.getByRole('button', { name: /^Close tab /i }).click()
  const confirmation = page.getByRole('dialog', { name: 'Stop running command?' })
  // A shell still starting under load may require the running-command confirmation.
  await expect
    .poll(async () => (await confirmation.isVisible()) || (await tab.count()) === 0, {
      timeout: 5_000
    })
    .toBe(true)
  if (await confirmation.isVisible()) {
    await confirmation.getByRole('button', { name: 'Stop and Close', exact: true }).click()
  }
}

/** Count rendered tabs in the tab bar (user-visible, not store-level). */
async function countRenderedTabs(page: Page): Promise<number> {
  return page.locator(SORTABLE_TAB).count()
}

// Read DOM data-active so a correct store id cannot hide a broken rendered selection indicator.
async function getDomActiveTabId(page: Page): Promise<string | null> {
  return page.evaluate((selector) => {
    const match = document.querySelector(`${selector}[data-active="true"]`)
    return match?.getAttribute('data-tab-id') ?? null
  }, SORTABLE_TAB)
}

async function getFocusedTerminalTabId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || !active.classList.contains('xterm-helper-textarea')) {
      return null
    }
    return active.closest('[data-terminal-tab-id]')?.getAttribute('data-terminal-tab-id') ?? null
  })
}

test.describe('Tabs', () => {
  test.beforeEach(async ({ appPage }) => {
    await waitForSessionReady(appPage)
    await waitForStartupWorktreeRefresh(appPage)
    await waitForActiveWorktree(appPage)
    await ensureTerminalVisible(appPage)
    const initialTabId = (await getActiveTabId(appPage))!
    await expect(tabLocator(appPage, initialTabId)).toBeVisible()
  })

  // Use the real + → New Terminal flow and require a new rendered tab.
  test('clicking "+" then "New Terminal" creates a new terminal tab', async ({ appPage }) => {
    const tabsBefore = await countRenderedTabs(appPage)

    // Hidden animated terminals can invalidate Playwright stability despite an enabled visible button.
    await appPage.getByRole('button', { name: 'New tab' }).click({ force: true })
    const newTerminalMenuItem = appPage.getByRole('menuitem', { name: /New Terminal/i }).first()
    await newTerminalMenuItem.click()
    await expect(newTerminalMenuItem).toBeHidden({ timeout: 3_000 })

    await expect
      .poll(() => countRenderedTabs(appPage), {
        timeout: 5_000,
        message: 'Clicking + → New Terminal did not render a new tab in the tab bar'
      })
      .toBeGreaterThan(tabsBefore)

    const activeType = await getActiveTabType(appPage)
    expect(activeType).toBe('terminal')

    const storeActiveId = await getActiveTabId(appPage)
    expect(storeActiveId).not.toBeNull()
    await expect(tabLocator(appPage, storeActiveId!)).toBeVisible()
    await expect.poll(() => getDomActiveTabId(appPage), { timeout: 3_000 }).toBe(storeActiveId)
    await expect
      .poll(() => getFocusedTerminalTabId(appPage), {
        timeout: 5_000,
        message: 'Menu-created terminal tab did not receive keyboard focus'
      })
      .toBe(storeActiveId)
  })

  test('clicking "+" then "New Markdown" focuses the editor', async ({
    appPage,
    registerPostElectronShutdownCleanup
  }) => {
    let createdFilePath: string | null = null
    registerPostElectronShutdownCleanup(async () => {
      if (createdFilePath) {
        await rm(createdFilePath, { force: true })
      }
    })

    const preExistingFileIds = await appPage.evaluate(
      () => window.__store?.getState().openFiles.map((file) => file.id) ?? []
    )

    await appPage.getByRole('button', { name: 'New tab' }).click({ force: true })
    const newMarkdownMenuItem = appPage.getByRole('menuitem', { name: /New Markdown/i }).first()
    await newMarkdownMenuItem.click()

    // Require a newly minted id and retain its cleanup path so existing Markdown cannot satisfy or be deleted by this test.
    const createdFileHandle = await appPage.waitForFunction(
      (knownFileIds) => {
        const state = window.__store?.getState()
        const file = state?.openFiles.find((candidate) => candidate.id === state.activeFileId)
        if (!file || knownFileIds.includes(file.id)) {
          return null
        }
        return { id: file.id, filePath: file.filePath }
      },
      preExistingFileIds,
      { timeout: 25_000 }
    )
    const createdFile = (await createdFileHandle.jsonValue())!
    createdFilePath = createdFile.filePath

    const editor = appPage.locator('.rich-markdown-editor')
    await expect(editor).toBeVisible({ timeout: 25_000 })
    await expect(newMarkdownMenuItem).toBeHidden({ timeout: 3_000 })

    await expect
      .poll(() => editor.evaluate((element) => document.activeElement === element), {
        timeout: 5_000,
        message: 'Menu-created Markdown editor did not receive keyboard focus'
      })
      .toBe(true)

    const sentinel = `autofocus-${Date.now()}`
    // Why: typing through the page keyboard proves focus landed without an editor click.
    await appPage.keyboard.type(sentinel)
    await expect(editor).toContainText(sentinel)

    await appPage.evaluate((fileId) => {
      window.__store?.getState().closeFile(fileId)
    }, createdFile.id)
    await expect(editor).toBeHidden()
  })

  test('Cmd/Ctrl+T creates a new terminal tab', async ({ appPage }) => {
    const isMac = process.platform === 'darwin'
    const mod = isMac ? 'Meta' : 'Control'
    const tabsBefore = await countRenderedTabs(appPage)

    // Focus body so stale search inputs cannot consume the window shortcut.
    await appPage.evaluate(() => document.body.focus())
    await appPage.keyboard.press(`${mod}+t`)

    await expect
      .poll(() => countRenderedTabs(appPage), {
        timeout: 5_000,
        message: `${mod}+T did not add a tab to the tab bar`
      })
      .toBe(tabsBefore + 1)

    // Use the store only to distinguish surface type; DOM must independently prove one active tab.
    const activeType = await getActiveTabType(appPage)
    expect(activeType).toBe('terminal')

    // Require exactly one DOM-active tab matching store selection.
    const storeActiveId = await getActiveTabId(appPage)
    expect(storeActiveId).not.toBeNull()
    await expect.poll(() => getDomActiveTabId(appPage), { timeout: 3_000 }).toBe(storeActiveId)
  })

  test('clicking tabs still switches after dragging a terminal tab to reorder', async ({
    appPage
  }) => {
    const worktreeId = (await getActiveWorktreeId(appPage))!

    await appPage.evaluate((targetWorktreeId) => {
      const store = window.__store
      if (!store) {
        return
      }
      const state = store.getState()
      const existing = (state.tabsByWorktree[targetWorktreeId] ?? []).length
      for (let i = existing; i < 2; i++) {
        state.createTab(targetWorktreeId)
      }
    }, worktreeId)
    await expect
      .poll(() => countRenderedTabs(appPage), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2)

    const domOrderBefore = await appPage.$$eval(SORTABLE_TAB, (nodes) =>
      nodes.map((n) => (n as HTMLElement).dataset.tabId ?? '')
    )
    const [firstTabId, secondTabId] = domOrderBefore
    expect(firstTabId).toBeTruthy()
    expect(secondTabId).toBeTruthy()

    await tabLocator(appPage, firstTabId).click({ force: true })
    await expect.poll(() => getDomActiveTabId(appPage), { timeout: 3_000 }).toBe(firstTabId)

    const firstTabBox = await tabLocator(appPage, firstTabId).boundingBox()
    const secondTabBox = await tabLocator(appPage, secondTabId).boundingBox()
    expect(firstTabBox).not.toBeNull()
    expect(secondTabBox).not.toBeNull()
    const startX = firstTabBox!.x + firstTabBox!.width / 2
    const startY = firstTabBox!.y + firstTabBox!.height / 2
    const endX = secondTabBox!.x + secondTabBox!.width * 0.75
    const endY = secondTabBox!.y + secondTabBox!.height / 2
    await appPage.mouse.move(startX, startY)
    await appPage.mouse.down()
    // Drag far enough for dnd-kit to reorder, then release over the strip before selecting again.
    await appPage.mouse.move(endX, endY, { steps: 8 })
    await appPage.mouse.up()

    await expect
      .poll(
        async () =>
          appPage.$$eval(SORTABLE_TAB, (nodes) =>
            nodes.map((n) => (n as HTMLElement).dataset.tabId ?? '')
          ),
        { timeout: 5_000, message: 'Terminal tab drag did not reorder the tab strip' }
      )
      .toEqual([secondTabId, firstTabId, ...domOrderBefore.slice(2)])

    await tabLocator(appPage, firstTabId).click({ force: true })
    await expect.poll(() => getDomActiveTabId(appPage), { timeout: 3_000 }).toBe(firstTabId)
    await tabLocator(appPage, secondTabId).click({ force: true })
    await expect
      .poll(() => getDomActiveTabId(appPage), {
        timeout: 5_000,
        message: 'Tab click did not activate after a terminal tab reorder drag'
      })
      .toBe(secondTabId)
  })

  // After reorder, Cmd/Ctrl+Shift+[ must follow the visible group order, not stale tabBarOrderByWorktree.
  // Require DOM data-active to follow each expected tab as well as store selection.
  test('Cmd/Ctrl+Shift+[ walks tabs in drag-reordered order', async ({ appPage }) => {
    const isMac = process.platform === 'darwin'
    const mod = isMac ? 'Meta' : 'Control'
    const worktreeId = (await getActiveWorktreeId(appPage))!

    // Seed at least three tabs directly; separate tests exercise + creation.
    await appPage.evaluate((targetWorktreeId) => {
      const store = window.__store
      if (!store) {
        return
      }
      const state = store.getState()
      const existing = (state.tabsByWorktree[targetWorktreeId] ?? []).length
      for (let i = existing; i < 3; i++) {
        state.createTab(targetWorktreeId)
      }
    }, worktreeId)
    await expect
      .poll(async () => (await getWorktreeTabs(appPage, worktreeId)).length, {
        timeout: 5_000
      })
      .toBeGreaterThanOrEqual(3)

    const initialOrder = await getTabBarOrder(appPage, worktreeId)
    expect(initialOrder.length).toBeGreaterThanOrEqual(3)
    const [a, b, c] = initialOrder

    // Use the production drag/drop store action to move first to last.
    await appPage.evaluate((targetWorktreeId) => {
      const store = window.__store
      if (!store) {
        return
      }
      const state = store.getState()
      const groups = state.groupsByWorktree[targetWorktreeId] ?? []
      const activeGroupId = state.activeGroupIdByWorktree[targetWorktreeId]
      const activeGroup = activeGroupId
        ? groups.find((group) => group.id === activeGroupId)
        : groups[0]
      if (!activeGroup) {
        return
      }
      const [first, ...rest] = activeGroup.tabOrder
      state.reorderUnifiedTabs(activeGroup.id, [...rest, first])
    }, worktreeId)
    await expect
      .poll(async () => getTabBarOrder(appPage, worktreeId), {
        timeout: 3_000
      })
      .toEqual([b, c, a])

    // Activate the last tab in the new visible order, then walk left twice.
    // Expected cycle: a → c → b (i.e. walks the *new* order in reverse).
    await appPage.evaluate((tabId) => {
      window.__store?.getState().setActiveTab(tabId)
    }, a)
    await expect.poll(() => getDomActiveTabId(appPage), { timeout: 3_000 }).toBe(a)

    await appPage.keyboard.press(`${mod}+Shift+BracketLeft`)
    await expect.poll(() => getDomActiveTabId(appPage), { timeout: 3_000 }).toBe(c)
    await expect(tabLocator(appPage, c)).toHaveAttribute('data-active', 'true')

    await appPage.keyboard.press(`${mod}+Shift+BracketLeft`)
    await expect.poll(() => getDomActiveTabId(appPage), { timeout: 3_000 }).toBe(b)
    await expect(tabLocator(appPage, b)).toHaveAttribute('data-active', 'true')
  })

  // Click the real X and require DOM removal so store-only close cannot hide a stuck tab.
  test('closing the active tab removes it and activates a neighbor', async ({ appPage }) => {
    const worktreeId = (await getActiveWorktreeId(appPage))!

    // Need a second tab so we can close one without deactivating the worktree.
    await appPage.evaluate((targetWorktreeId) => {
      const store = window.__store
      if (!store) {
        return
      }
      const state = store.getState()
      if ((state.tabsByWorktree[targetWorktreeId] ?? []).length < 2) {
        state.createTab(targetWorktreeId)
      }
    }, worktreeId)
    await expect
      .poll(() => countRenderedTabs(appPage), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2)

    const tabsBefore = await countRenderedTabs(appPage)
    const activeId = await getActiveTabId(appPage)
    expect(activeId).not.toBeNull()
    await closeTabFromTabBar(appPage, activeId!)

    await expect
      .poll(() => countRenderedTabs(appPage), {
        timeout: 5_000,
        message: 'Clicking close did not remove the tab element from the DOM'
      })
      .toBe(tabsBefore - 1)
    await expect.poll(() => getDomActiveTabId(appPage), { timeout: 5_000 }).not.toBe(activeId)
    await expect.poll(() => getDomActiveTabId(appPage), { timeout: 5_000 }).not.toBeNull()
  })
})
