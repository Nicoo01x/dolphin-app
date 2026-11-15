// Require scrollback retention across tab, pane and worktree changes.

import { test, expect } from './helpers/dolphin-app'
import {
  discoverActivePtyId,
  execInTerminal,
  closeActiveTerminalPane,
  countVisibleTerminalPanes,
  focusLastTerminalPane,
  splitActiveTerminalPane,
  waitForTerminalOutput,
  waitForPaneCount,
  getTerminalContent
} from './helpers/terminal'
import {
  getActiveWorktreeId,
  getActiveTabType,
  getWorktreeTabs,
  getAllWorktreeIds,
  switchToOtherWorktree,
  switchToWorktree,
  ensureTerminalVisible
} from './helpers/store'
import { pressShortcut } from './helpers/shortcuts'
import { registerTerminalPaneMountReadiness } from './helpers/terminal-pane-mount-readiness'

// Serialize headful scenarios; visible-window runs require an isolated display.
test.describe.configure({ mode: 'serial' })
test.describe('Terminal Panes', () => {
  registerTerminalPaneMountReadiness()

  test('terminal pane retains content when switching tabs and back', async ({ appPage }) => {
    const ptyId = await discoverActivePtyId(appPage)
    const marker = `RETAIN_TEST_${Date.now()}`
    await execInTerminal(appPage, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(appPage, marker)

    const worktreeId = (await getActiveWorktreeId(appPage))!
    await pressShortcut(appPage, 't')

    await expect
      .poll(async () => (await getWorktreeTabs(appPage, worktreeId)).length, { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2)

    const activeType = await getActiveTabType(appPage)
    expect(activeType).toBe('terminal')

    await pressShortcut(appPage, 'BracketLeft', { shift: true })

    await expect
      .poll(async () => (await getTerminalContent(appPage)).includes(marker), {
        timeout: 5_000
      })
      .toBe(true)

    await pressShortcut(appPage, 'BracketRight', { shift: true })
    await pressShortcut(appPage, 'w')
  })

  test('terminal pane retains content when splitting and closing a pane', async ({ appPage }) => {
    const ptyId = await discoverActivePtyId(appPage)
    const marker = `SPLIT_RETAIN_${Date.now()}`
    await execInTerminal(appPage, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(appPage, marker)

    const panesBefore = await countVisibleTerminalPanes(appPage)

    await splitActiveTerminalPane(appPage, 'vertical')
    await waitForPaneCount(appPage, panesBefore + 1)

    await focusLastTerminalPane(appPage)
    await closeActiveTerminalPane(appPage)
    await waitForPaneCount(appPage, panesBefore)

    await expect
      .poll(async () => (await getTerminalContent(appPage)).includes(marker), {
        timeout: 5_000
      })
      .toBe(true)
  })

  test('terminal pane retains content when switching worktrees and back', async ({ appPage }) => {
    const allWorktreeIds = await getAllWorktreeIds(appPage)
    if (allWorktreeIds.length < 2) {
      test.skip(true, 'Need at least 2 worktrees to test worktree switching')
      return
    }

    const worktreeId = (await getActiveWorktreeId(appPage))!

    const ptyId = await discoverActivePtyId(appPage)
    const marker = `WT_RETAIN_${Date.now()}`
    await execInTerminal(appPage, ptyId, `echo ${marker}`)
    await waitForTerminalOutput(appPage, marker)

    const otherId = await switchToOtherWorktree(appPage, worktreeId)
    expect(otherId).not.toBeNull()
    await expect.poll(async () => getActiveWorktreeId(appPage), { timeout: 5_000 }).toBe(otherId)

    await switchToWorktree(appPage, worktreeId)
    await expect.poll(async () => getActiveWorktreeId(appPage), { timeout: 5_000 }).toBe(worktreeId)

    // Poll the retained marker after worktree return: serialize-addon rebind can lag the activation cascade, so avoid an earlier manager-timing assertion.
    await ensureTerminalVisible(appPage)

    await expect
      .poll(async () => (await getTerminalContent(appPage)).includes(marker), {
        timeout: 20_000
      })
      .toBe(true)
  })
})
