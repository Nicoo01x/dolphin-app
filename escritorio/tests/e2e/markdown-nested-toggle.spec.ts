import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/dolphin-app'
import {
  cleanupMarkdownFixture,
  closeActiveEditorTab,
  createMarkdownFixture,
  getActiveWorktreeContext,
  openMarkdownFixture,
  waitForRichMarkdownEditor
} from './helpers/markdown-editor-fixture'
import {
  expectEditableNestedToggles,
  expectFileKeepsNesting,
  expectPassthroughFallback,
  expectSentinelInsideNestedToggle,
  NESTED_TOGGLE_FIXTURE_DIRECTORY,
  NESTED_TOGGLE_MARKDOWN,
  placeCaretInNestedToggleBody,
  UNSUPPORTED_NESTED_TOGGLE_MARKDOWN
} from './helpers/markdown-nested-toggle'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.describe('Markdown nested toggle regression', () => {
  test.beforeEach(async ({ appPage }) => {
    await waitForSessionReady(appPage)
    await waitForActiveWorktree(appPage)
  })

  test('editing a nested toggle survives save and reopen', async ({ appPage }, testInfo) => {
    const context = await getActiveWorktreeContext(appPage)
    const sentinel = `editedInsideNestedToggle${Date.now()}`
    let filePath: string | null = null

    try {
      filePath = await createMarkdownFixture(
        context,
        NESTED_TOGGLE_FIXTURE_DIRECTORY,
        'nested-toggle-edit',
        testInfo.workerIndex,
        NESTED_TOGGLE_MARKDOWN
      )
      await openMarkdownFixture(appPage, context, filePath)
      await waitForRichMarkdownEditor(appPage)
      await expectEditableNestedToggles(appPage)

      await placeCaretInNestedToggleBody(appPage)
      await appPage.keyboard.type(` ${sentinel}`)
      await expectSentinelInsideNestedToggle(appPage, sentinel)

      // Save through the real shortcut and assert the bytes that landed on disk.
      await appPage.keyboard.press('ControlOrMeta+S')
      const savedPath = filePath
      await expect
        .poll(() => readFileSync(savedPath, 'utf8'), { timeout: 10_000 })
        .toContain(sentinel)
      expectFileKeepsNesting(readFileSync(savedPath, 'utf8'), sentinel)

      // Reopen the saved bytes from scratch; the reported bug appeared only after reparsing.
      await closeActiveEditorTab(appPage, savedPath)
      await openMarkdownFixture(appPage, context, savedPath)
      await waitForRichMarkdownEditor(appPage)
      await expectEditableNestedToggles(appPage)
      await expectSentinelInsideNestedToggle(appPage, sentinel)
    } finally {
      await cleanupMarkdownFixture(filePath)
    }
  })

  test('a nested toggle that cannot be represented stays raw passthrough', async ({
    appPage
  }, testInfo) => {
    const context = await getActiveWorktreeContext(appPage)
    let filePath: string | null = null

    try {
      filePath = await createMarkdownFixture(
        context,
        NESTED_TOGGLE_FIXTURE_DIRECTORY,
        'nested-toggle-unsupported',
        testInfo.workerIndex,
        UNSUPPORTED_NESTED_TOGGLE_MARKDOWN
      )
      await openMarkdownFixture(appPage, context, filePath)
      await waitForRichMarkdownEditor(appPage)

      await expectPassthroughFallback(appPage)
    } finally {
      await cleanupMarkdownFixture(filePath)
    }
  })
})
